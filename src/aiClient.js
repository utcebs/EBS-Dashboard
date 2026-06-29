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

// Pull the live portfolio (public read client — same pattern the app uses).
export async function fetchPortfolio() {
  const [p, m, r] = await Promise.all([
    supabasePublic.from('projects').select('*').order('project_number'),
    supabasePublic.from('milestones').select('*').order('project_id'),
    supabasePublic.from('risks').select('*').order('project_id'),
  ])
  return { projects: p.data || [], milestones: m.data || [], risks: r.data || [] }
}

// Trim rows to the fields that matter (tolerant of column-name variants).
const slimProject = (p) => ({
  no: p.project_number, name: p.project_name || p.name,
  status: p.status, priority: p.priority, phase: p.phase,
  percent: p.percent_complete, owner: p.business_owner || p.owner,
  dev: p.development_status, uat: p.uat_status,
  keyRisks: p.key_risks, dependencies: p.dependencies,
})
const slimMilestone = (m) => ({
  project: m.project_id, no: m.milestone_number,
  name: m.name || m.title || m.milestone, date: m.due_date || m.target_date || m.date,
  status: m.status, owner: m.owner,
})
const slimRisk = (r) => ({
  project: r.project_id, no: r.risk_number,
  risk: r.description || r.risk || r.key_risk, severity: r.severity || r.impact,
  likelihood: r.likelihood || r.probability, mitigation: r.mitigation_action || r.mitigation, owner: r.owner,
})

function snapshot({ projects, milestones, risks }) {
  return JSON.stringify({
    projects: projects.map(slimProject),
    milestones: milestones.map(slimMilestone),
    risks: risks.map(slimRisk),
  })
}

// ── Daily Briefing ──────────────────────────────────────────────────────────
export async function dailyBriefing(data, today) {
  const system =
    'You are an executive project-portfolio analyst for the EBS (Enterprise Business Solutions) department. ' +
    'Be concise, specific and action-oriented. Use ONLY the data provided; never invent projects or numbers.'
  const prompt =
    `Today is ${today}. Here is the current portfolio as JSON:\n${snapshot(data)}\n\n` +
    'Write a short daily briefing in markdown with these sections (omit a section if there is nothing to say):\n' +
    '**Headline** — one line on overall portfolio health.\n' +
    '**Needs attention** — delayed / at-risk projects, each with a one-line why.\n' +
    '**Milestones** — overdue or upcoming ones worth flagging.\n' +
    '**Top risks** — the 2-3 most serious, with the mitigation if given.\n' +
    '**Do next** — 2-3 concrete recommended actions.\n' +
    'Keep it tight — short bullets, no preamble.'
  return callAI(system, prompt, 'heavy')
}

// ── Chatbot ─────────────────────────────────────────────────────────────────
export async function chatAnswer(data, question, history = []) {
  const system =
    'You are the EBS project assistant. Answer questions about the department\'s projects, milestones and risks ' +
    'using ONLY the provided data. Derive/aggregate where needed (counts, who owns what, what is delayed). ' +
    'If the answer truly is not in the data, say so briefly. Be concise and use markdown when it helps.'
  const convo = history.length
    ? 'Recent conversation:\n' + history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n') + '\n\n'
    : ''
  const prompt = `Portfolio data (JSON):\n${snapshot(data)}\n\n${convo}Question: ${question}`
  return callAI(system, prompt, 'light')
}
