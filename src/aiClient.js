// Front-end AI helper for the EBS-Dashboard. Talks to the Supabase Edge
// Function `ai` (which holds the Gemini/Groq keys server-side) and builds the
// project-portfolio prompts for the Daily Briefing + Chatbot.
import { supabase, supabasePublic } from './supabaseClient'

// Call the Edge Function. Returns { text, provider }.
export async function callAI(system, prompt, tier = 'light') {
  const { data, error } = await supabase.functions.invoke('ai', { body: { system, prompt, tier } })
  if (error) throw new Error(error.message || 'AI request failed')
  if (data?.error) throw new Error(data.detail || data.error)
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
    `Begin with exactly one title line: "# EBS Daily Portfolio Briefing – ${today}". Then the sections below. ` +
    'Write a short daily briefing in markdown with these sections (omit a section if there is nothing to say):\n' +
    '**Headline** — one line on overall portfolio health.\n' +
    '**Needs attention** — delayed / at-risk projects, each with a one-line why.\n' +
    '**Milestones** — overdue or upcoming ones worth flagging.\n' +
    '**Top risks** — the 2-3 most serious, with the mitigation if given.\n' +
    '**Do next** — 2-3 concrete recommended actions.\n' +
    'Keep it tight — short bullets, no preamble.'
  return callAI(system, prompt, 'heavy')
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
