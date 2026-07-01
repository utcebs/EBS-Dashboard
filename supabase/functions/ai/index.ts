// EBS-Dashboard AI Edge Function (Deno) — runs on Supabase, holds the API keys
// as secrets so nothing is exposed in the browser. Accepts { system, prompt,
// tier } and returns { text, provider, truncated }. Tries Gemini (multi-key +
// model fallback), then falls back to Groq if all Gemini keys are exhausted.
//
// Deploy:  supabase functions deploy ai
// Secrets: supabase secrets set GEMINI_API_KEY=... [GEMINI_API_KEY_2=... GEMINI_API_KEY_3=...] [GROQ_API_KEY=...]

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } })

// Per-request timeout so a hung provider can't stall the whole invocation (and
// thus never reach the fallback). On timeout `fetch` throws an AbortError.
async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Tiered Gemini model fallback chains (cheap → strong).
const CHAINS: Record<string, string[]> = {
  light: ["gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"],
  heavy: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"],
}

function geminiKeys(): string[] {
  const keys = [
    Deno.env.get("GEMINI_API_KEY"),
    Deno.env.get("GEMINI_API_KEY_2"),
    Deno.env.get("GEMINI_API_KEY_3"),
  ].filter(Boolean) as string[]
  // Also accept a comma-separated GEMINI_API_KEYS bundle.
  const bundle = Deno.env.get("GEMINI_API_KEYS")
  if (bundle) keys.push(...bundle.split(",").map((k) => k.trim()).filter(Boolean))
  return [...new Set(keys)]
}

type ProviderResult = { text: string; truncated: boolean }

async function callGemini(model: string, key: string, system: string, prompt: string): Promise<ProviderResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    // thinkingBudget:0 disables 2.5-flash's default "thinking" (which otherwise
    // eats the output budget and truncates the briefing). maxOutputTokens raised
    // so a full multi-section briefing fits.
    generationConfig: { temperature: 0.6, maxOutputTokens: 2600, thinkingConfig: { thinkingBudget: 0 } },
  }
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, 18000)
  if (!res.ok) {
    const txt = await res.text()
    const err = new Error(`gemini ${res.status}: ${txt.slice(0, 200)}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  const data = await res.json()
  const cand = data?.candidates?.[0]
  const text: string = cand?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? ""
  const finishReason: string | undefined = cand?.finishReason
  if (!text) {
    // Empty usually means a safety block or an over-thinking truncation. Tag a
    // safety block as 400 so the loop skips straight to Groq instead of retrying
    // every key/model against the same blocked prompt.
    const reason = data?.promptFeedback?.blockReason || finishReason || "empty"
    const err = new Error(`gemini empty response (${reason})`) as Error & { status?: number }
    err.status = (finishReason === "SAFETY" || data?.promptFeedback?.blockReason) ? 400 : 502
    throw err
  }
  return { text, truncated: finishReason === "MAX_TOKENS" }
}

async function callGroq(system: string, prompt: string): Promise<ProviderResult> {
  const key = Deno.env.get("GROQ_API_KEY")
  if (!key) throw new Error("no GROQ_API_KEY configured")
  const model = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile"
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 1400,
    }),
  }, 18000)
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const text: string = data?.choices?.[0]?.message?.content ?? ""
  // Don't return a blank 200 — surface it as a failure so the client can show
  // the "AI down" message instead of an empty briefing/answer.
  if (!text.trim()) throw new Error("groq empty response")
  return { text, truncated: data?.choices?.[0]?.finish_reason === "length" }
}

// Run the full provider chain (Gemini multi-key/model → Groq). Throws with
// .allFailed on total failure so the handler can return a 502.
async function runProviders(system: string, prompt: string, tier: string): Promise<{ text: string; provider: string; truncated: boolean }> {
  const keys = geminiKeys()
  const chain = CHAINS[tier] || CHAINS.light
  let lastErr = ""
  let abortGemini = false
  for (const key of keys) {
    for (const model of chain) {
      try {
        const r = await callGemini(model, key, system, prompt)
        return { ...r, provider: "gemini" }
      } catch (e) {
        lastErr = String(e)
        const status = (e as { status?: number })?.status
        const name = (e as { name?: string })?.name
        if (status === 400) { abortGemini = true; break }
        if (status === 429 || status === 403 || name === "AbortError") break
      }
    }
    if (abortGemini) break
  }
  try {
    const r = await callGroq(system, prompt)
    return { ...r, provider: "groq" }
  } catch (e) {
    lastErr = `${lastErr} | groq: ${e}`
  }
  const err = new Error(lastErr.slice(0, 400)) as Error & { allFailed?: boolean }
  err.allFailed = true
  throw err
}

// ── Server-side Daily Briefing (generate + persist) ──────────────────────────
// Runs with the service role so a guest can trigger a regenerate and have it
// cached for everyone, WITHOUT reopening anon writes to ai_briefings (which
// would let anyone inject arbitrary briefing content).
const SB_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
function sbRest(path: string, init: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "content-type": "application/json", ...(init.headers || {}) },
  })
}

// deno-lint-ignore no-explicit-any
const slimProject = (p: any) => ({ no: p.project_number, name: p.project_name, module: p.dept_module, status: p.status, priority: p.priority, phase: p.phase, percent: p.percent_complete, owner: p.business_owner, start: p.start_date, end: p.end_date, objective: p.objective, impact: p.business_impact, keyRisks: p.key_risks, mitigation: p.mitigation, dependencies: p.dependencies, actionsNeeded: p.actions_needed, costKWD: p.total_cost_kwd })
// deno-lint-ignore no-explicit-any
const slimMilestone = (m: any) => ({ no: m.milestone_number, deliverable: m.deliverable, target: m.target_date, actual: m.actual_date, dev: m.development_status, uat: m.uat_status, owner: m.owner, dependencies: m.dependencies, remarks: m.remarks })
// deno-lint-ignore no-explicit-any
const slimRisk = (r: any) => ({ project: r.project_id, no: r.risk_number, risk: r.description || r.risk || r.title, severity: r.severity || r.impact, likelihood: r.likelihood || r.probability, mitigation: r.mitigation_action || r.mitigation, owner: r.owner })

// deno-lint-ignore no-explicit-any
function snapshot(projects: any[], milestones: any[], risks: any[]) {
  const nameById: Record<string, string> = {}
  projects.forEach((p) => { nameById[p.id] = p.project_name })
  const byStatus: Record<string, number> = {}, byPriority: Record<string, number> = {}
  projects.forEach((p) => {
    byStatus[p.status || "Unknown"] = (byStatus[p.status || "Unknown"] || 0) + 1
    byPriority[p.priority || "Unknown"] = (byPriority[p.priority || "Unknown"] || 0) + 1
  })
  return JSON.stringify({
    summary: { totalProjects: projects.length, byStatus, byPriority, totalMilestones: milestones.length, totalRisks: risks.length },
    projects: projects.map(slimProject),
    milestones: milestones.map((m) => ({ project: nameById[m.project_id] || "Unknown", ...slimMilestone(m) })),
    risks: risks.map(slimRisk),
  })
}

async function generateBriefing(today: string) {
  const [projects, milestones, risks] = await Promise.all([
    sbRest("projects?select=*&order=project_number").then((r) => r.json()).catch(() => []),
    sbRest("milestones?select=*&order=project_id").then((r) => r.json()).catch(() => []),
    sbRest("risks?select=*&order=project_id").then((r) => r.json()).catch(() => []),
  ])
  const system =
    "You are an executive project-portfolio analyst for the EBS (Enterprise Business Solutions) department. " +
    "Be concise, specific and action-oriented. Use ONLY the data provided; never invent projects, names or numbers. " +
    "When stating ANY count, total or status breakdown, copy the exact numbers from the `summary` object verbatim — " +
    "do NOT tally the lists yourself (you will miscount). Reference projects by their exact `name`. " +
    "Risk information lives in each project's `keyRisks` field (the separate `risks` list may be empty)."
  const prompt =
    `Today is ${today}. Here is the current portfolio as JSON:\n${snapshot(projects || [], milestones || [], risks || [])}\n\n` +
    "Do NOT add a title or date line — start directly with the Headline section. " +
    'Use **bold** for the section labels (e.g. **Headline**), NOT markdown "#" headings. ' +
    "Write a short daily briefing in markdown with these sections (omit a section if there is nothing to say):\n" +
    "**Headline** — one line on overall portfolio health.\n" +
    "**Needs attention** — delayed / at-risk projects, each with a one-line why.\n" +
    "**Milestones** — overdue or upcoming ones worth flagging.\n" +
    "**Top risks** — the 2-3 most serious, with the mitigation if given.\n" +
    "**Do next** — 2-3 concrete recommended actions.\n" +
    "Keep it tight — short bullets, no preamble."
  const r = await runProviders(system, prompt, "heavy")
  const text = `# EBS Daily Portfolio Briefing – ${today}\n\n${r.text}`
  // Persist with the service role (bypasses RLS). Non-fatal if it fails.
  let generated_at: string | undefined, id: string | undefined
  try {
    const ins = await sbRest("ai_briefings", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ content: text, provider: r.provider }) })
    if (ins.ok) { const rows = await ins.json(); generated_at = rows?.[0]?.generated_at; id = rows?.[0]?.id }
  } catch { /* still return the briefing even if caching failed */ }
  return { text, provider: r.provider, generated_at, id, saved: !!id }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS })

  // Parse the body defensively — a malformed/empty body is a client error (400).
  let payload: Record<string, unknown> = {}
  try {
    payload = await req.json()
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }

  const { system = "", prompt = "", tier = "light", warmup = false, action = "", today = "" } = payload as {
    system?: string; prompt?: string; tier?: string; warmup?: boolean; action?: string; today?: string
  }
  if (warmup) return json({ ok: true })

  try {
    // Server-side briefing: fetch data + generate + save (guest-triggerable, cached for all).
    if (action === "briefing") {
      const t = today || new Date().toISOString().slice(0, 10)
      return json(await generateBriefing(t))
    }
    // Generic prompt path (chatbot, MBR content).
    if (!prompt) return json({ error: "prompt required" }, 400)
    const r = await runProviders(system, prompt, tier)
    return json({ text: r.text, provider: r.provider, truncated: r.truncated })
  } catch (e) {
    if ((e as { allFailed?: boolean })?.allFailed) return json({ error: "all providers failed", detail: String((e as Error).message) }, 502)
    return json({ error: String(e) }, 500)
  }
})
