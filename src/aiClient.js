// Front-end AI helper for the EBS-Dashboard. Talks to the Supabase Edge
// Function `ai` (which holds the Gemini/Groq keys server-side) and builds the
// project-portfolio prompts for the Daily Briefing + Chatbot.
import { supabase, supabasePublic } from './supabaseClient'

// Call the Edge Function. Returns { text, provider }.
export async function callAI(system, prompt, tier = 'light') {
  const { data, error } = await supabase.functions.invoke('ai', { body: { system, prompt, tier } })
  if (error) throw new Error(error.message || 'AI request failed')
  if (data?.error) throw new Error(data.detail || data.error)
  // A blank answer means the provider (or its backup) returned nothing — treat
  // it as a failure so callers show the "AI down" message instead of an empty UI.
  if (!data?.text || !String(data.text).trim()) throw new Error('AI returned an empty response')
  return data
}

// Boot the Edge Function instance (no AI call) so the first real request is fast.
export async function warmAI() {
  try { await supabase.functions.invoke('ai', { body: { warmup: true } }) } catch { /* ignore */ }
}

// Pull the live portfolio (public read client — same pattern the app uses).
export async function fetchPortfolio() {
  const [p, m, r] = await Promise.all([
    supabasePublic.from('projects').select('*').order('project_number'),
    supabasePublic.from('milestones').select('*').order('project_id'),
    supabasePublic.from('risks').select('*').order('project_id'),
  ])
  return { projects: p.data || [], milestones: m.data || [], risks: r.data || [] }
}

// Trim rows to the fields that matter — using the REAL EBS column names.
const slimProject = (p) => ({
  no: p.project_number, name: p.project_name, module: p.dept_module,
  status: p.status, priority: p.priority, phase: p.phase,
  percent: p.percent_complete, owner: p.business_owner,
  start: p.start_date, end: p.end_date,
  objective: p.objective, impact: p.business_impact,
  keyRisks: p.key_risks, mitigation: p.mitigation,
  dependencies: p.dependencies, actionsNeeded: p.actions_needed,
  costKWD: p.total_cost_kwd,
})
const slimMilestone = (m) => ({
  no: m.milestone_number, deliverable: m.deliverable,
  target: m.target_date, actual: m.actual_date,
  dev: m.development_status, uat: m.uat_status,
  owner: m.owner, dependencies: m.dependencies, remarks: m.remarks,
})
const slimRisk = (r) => ({
  project: r.project_id, no: r.risk_number,
  risk: r.description || r.risk || r.title, severity: r.severity || r.impact,
  likelihood: r.likelihood || r.probability,
  mitigation: r.mitigation_action || r.mitigation, owner: r.owner,
})

function snapshot({ projects, milestones, risks }) {
  const nameById = {}
  projects.forEach((p) => { nameById[p.id] = p.project_name })
  const byStatus = {}, byPriority = {}
  projects.forEach((p) => {
    byStatus[p.status || 'Unknown'] = (byStatus[p.status || 'Unknown'] || 0) + 1
    byPriority[p.priority || 'Unknown'] = (byPriority[p.priority || 'Unknown'] || 0) + 1
  })
  return JSON.stringify({
    // Pre-computed, reliable aggregates so the model never has to miscount.
    summary: { totalProjects: projects.length, byStatus, byPriority, totalMilestones: milestones.length, totalRisks: risks.length },
    projects: projects.map(slimProject),
    // Tag each milestone with its project NAME (the row only stores a uuid).
    milestones: milestones.map((m) => ({ project: nameById[m.project_id] || 'Unknown', ...slimMilestone(m) })),
    risks: risks.map(slimRisk),
  })
}

// ── Daily Briefing ──────────────────────────────────────────────────────────
export async function dailyBriefing(data, today) {
  const system =
    'You are an executive project-portfolio analyst for the EBS (Enterprise Business Solutions) department. ' +
    'Be concise, specific and action-oriented. Use ONLY the data provided; never invent projects, names or numbers. ' +
    'When stating ANY count, total or status breakdown, copy the exact numbers from the `summary` object verbatim — ' +
    'do NOT tally the lists yourself (you will miscount). Reference projects by their exact `name`. ' +
    'Risk information lives in each project\'s `keyRisks` field (the separate `risks` list may be empty).'
  const prompt =
    `Today is ${today}. Here is the current portfolio as JSON:\n${snapshot(data)}\n\n` +
    'Do NOT add a title or date line — start directly with the Headline section. ' +
    'Use **bold** for the section labels (e.g. **Headline**), NOT markdown "#" headings. ' +
    'Write a short daily briefing in markdown with these sections (omit a section if there is nothing to say):\n' +
    '**Headline** — one line on overall portfolio health.\n' +
    '**Needs attention** — delayed / at-risk projects, each with a one-line why.\n' +
    '**Milestones** — overdue or upcoming ones worth flagging.\n' +
    '**Top risks** — the 2-3 most serious, with the mitigation if given.\n' +
    '**Do next** — 2-3 concrete recommended actions.\n' +
    'Keep it tight — short bullets, no preamble.'
  const r = await callAI(system, prompt, 'heavy')
  // Prepend the title + date deterministically (the model is inconsistent about it).
  return { ...r, text: `# EBS Daily Portfolio Briefing – ${today}\n\n${r.text}` }
}

// Generate + persist the briefing server-side (Edge Function, service role).
// Works for guests too — they can regenerate and it's cached for the next
// visitor — without exposing ai_briefings to arbitrary anonymous writes.
export async function generateBriefing(today) {
  const { data, error } = await supabase.functions.invoke('ai', { body: { action: 'briefing', today } })
  if (error) throw new Error(error.message || 'AI request failed')
  if (data?.error) throw new Error(data.detail || data.error)
  if (!data?.text || !String(data.text).trim()) throw new Error('AI returned an empty response')
  return data // { text, provider, generated_at, id, saved }
}

// ── Cached briefing (shared across all users, regenerated on demand) ─────────
export async function getCachedBriefing() {
  const { data } = await supabasePublic
    .from('ai_briefings').select('*').order('generated_at', { ascending: false }).limit(1)
  return (data && data[0]) || null
}
export async function saveBriefing(content, provider) {
  const { data } = await supabase
    .from('ai_briefings').insert({ content, provider }).select().single()
  return data || null
}

// ── MBR (Monthly Business Review) — one-slide panel content ──────────────────
// Returns { highlights, risks, newThisMonth, focus, decisions }, each an array
// of { lead, detail }. The slide renderer draws `lead` bold + `detail` after it.
export async function mbrContent(data, ctx) {
  const system =
    'You are an executive project-portfolio analyst writing a ONE-SLIDE Monthly Business Review (MBR) for the EBS ' +
    '(Enterprise Business Solutions) department. Use ONLY the provided data; never invent projects, owners, dates or numbers. ' +
    'Reference projects by their exact `name`. Risk information lives in each project\'s `keyRisks` field ' +
    '(the separate `risks` list may be empty). Every item is a single crisp executive bullet made of a bold LEAD ' +
    '(a project, workstream or owning function) and a terse DETAIL. Return STRICT JSON only — no prose, no markdown fences.'
  const prompt =
    `Reporting month: ${ctx.month} ${ctx.year}. Following month: ${ctx.nextMonth} ${ctx.nextYear}.\n` +
    `Current portfolio (JSON):\n${snapshot(data)}\n\n` +
    'Return a JSON object with EXACTLY these keys, each an array of objects shaped {"lead": string, "detail": string}:\n' +
    '- "highlights": 5-8 wins / progress made this month (completed or near-complete work). lead = project/workstream, detail = what was achieved.\n' +
    '- "risks": 4-7 delayed / at-risk / on-hold items or serious key risks. lead = project, detail = the risk and its impact (include a date if given).\n' +
    '- "newThisMonth": 3-7 projects newly started or added this month. If start dates are unclear, use the most recently started projects. lead = project, detail = module or business owner.\n' +
    `- "focus": 5-9 priorities for ${ctx.nextMonth} ${ctx.nextYear} (upcoming go-lives, UAT sign-offs, milestones due). lead = project, detail = the target/action and date.\n` +
    '- "decisions": 4-7 decisions leadership must make now (drawn from actionsNeeded, blockers, dependencies). lead = the owning function or person (e.g. Finance, Operations, Executive, Commercial), detail = the decision needed and due date if known.\n' +
    'Rules: keep every `lead` <= 5 words and every `detail` <= 16 words. Never leave an array empty — if a section truly has nothing, return a single item saying so. Output JSON only.'
  const r = await callAI(system, prompt, 'heavy')
  return parseMbrJson(r.text)
}

function parseMbrJson(text) {
  let t = String(text || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a >= 0 && b > a) t = t.slice(a, b + 1)
  let obj
  try { obj = JSON.parse(t) } catch { return null }
  const norm = (arr) => Array.isArray(arr) ? arr.map((it) => {
    if (it && typeof it === 'object') return { lead: String(it.lead || '').trim(), detail: String(it.detail || it.text || '').trim() }
    const s = String(it || '')
    const parts = s.split(/\s+[–—-]\s+/)
    return { lead: (parts[0] || '').replace(/\*\*/g, '').trim(), detail: parts.slice(1).join(' — ').replace(/\*\*/g, '').trim() }
  }).filter((x) => x.lead || x.detail) : []
  return {
    highlights: norm(obj.highlights),
    risks: norm(obj.risks),
    newThisMonth: norm(obj.newThisMonth || obj.new_this_month),
    focus: norm(obj.focus),
    decisions: norm(obj.decisions),
  }
}

// ── Chatbot ─────────────────────────────────────────────────────────────────
export async function chatAnswer(data, question, history = []) {
  const system =
    'You are the EBS project assistant. Answer questions about the department\'s projects, milestones and risks ' +
    'using ONLY the provided data. Derive/aggregate where needed (counts, who owns what, what is delayed). ' +
    'For ANY count, total or status breakdown, copy the exact numbers from the `summary` object verbatim — never tally the lists yourself (you will miscount). ' +
    'Reference projects by their exact `name`; never invent projects or numbers. ' +
    'Risk info is in each project\'s `keyRisks` field (the separate `risks` list may be empty). ' +
    'If the answer truly is not in the data, say so briefly. Be concise and use markdown when it helps.'
  const convo = history.length
    ? 'Recent conversation:\n' + history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n') + '\n\n'
    : ''
  const prompt = `Portfolio data (JSON):\n${snapshot(data)}\n\n${convo}Question: ${question}`
  return callAI(system, prompt, 'light')
}
