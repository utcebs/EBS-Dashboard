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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS })

  // Parse the body defensively — a malformed/empty body is a client error (400),
  // not a server fault (500).
  let payload: Record<string, unknown> = {}
  try {
    payload = await req.json()
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }

  const { system = "", prompt = "", tier = "light", warmup = false } = payload as {
    system?: string; prompt?: string; tier?: string; warmup?: boolean
  }
  // Warm-up ping (sent when the chatbot opens) — boots this instance without an AI call.
  if (warmup) return json({ ok: true })
  if (!prompt) return json({ error: "prompt required" }, 400)

  try {
    const keys = geminiKeys()
    const chain = CHAINS[tier] || CHAINS.light
    let lastErr = ""
    let abortGemini = false

    for (const key of keys) {
      for (const model of chain) {
        try {
          const { text, truncated } = await callGemini(model, key, system, prompt)
          return json({ text, provider: "gemini", truncated })
        } catch (e) {
          lastErr = String(e)
          const status = (e as { status?: number })?.status
          const name = (e as { name?: string })?.name
          if (status === 400) { abortGemini = true; break }        // bad/blocked prompt → skip to Groq
          if (status === 429 || status === 403 || name === "AbortError") break // key dead/timeout → next key
          // else 5xx / transient → try the next model on this key
        }
      }
      if (abortGemini) break
    }

    // All Gemini failed/exhausted → Groq backup.
    try {
      const { text, truncated } = await callGroq(system, prompt)
      return json({ text, provider: "groq", truncated })
    } catch (e) {
      lastErr = `${lastErr} | groq: ${e}`
    }

    return json({ error: "all providers failed", detail: lastErr.slice(0, 400) }, 502)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
