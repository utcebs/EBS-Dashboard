// Admin-only user creation via the service role. Replaces client-side signUp so
// public signup can be disabled at the Auth server. Only an authenticated user
// whose profile role is 'admin' may call this.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } })

const SB_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? ""

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS })

  // 1) Caller must be a logged-in admin. Validate their token against Auth, then
  //    check their profile role with the service role.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
  if (!token) return json({ error: "unauthorized" }, 401)
  const meRes = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  if (!meRes.ok) return json({ error: "unauthorized" }, 401)
  const me = await meRes.json()
  const profRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${me.id}&select=role`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })
  const role = (await profRes.json())?.[0]?.role
  if (role !== "admin") return json({ error: "admin only" }, 403)

  // 2) Create the user with the service role (GoTrue admin API).
  let body: { email?: string; password?: string; full_name?: string; role?: string }
  try { body = await req.json() } catch { return json({ error: "invalid JSON body" }, 400) }
  const email = (body.email || "").trim().toLowerCase()
  const { password } = body
  const fullName = body.full_name || ""
  const newRole = body.role === "admin" ? "admin" : "user"
  if (!email || !password) return json({ error: "email and password are required" }, 400)
  if (!fullName.trim()) return json({ error: "full name is required" }, 400)

  const createRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName, role: newRole } }),
  })
  const created = await createRes.json()
  if (!createRes.ok) {
    return json({ error: created?.msg || created?.error_description || created?.error || "could not create user" }, createRes.status)
  }

  // 3) Ensure the profile has the right role/fields. This runs as service_role,
  //    which the guard_profile_role trigger trusts to set role.
  await fetch(`${SB_URL}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: created.id, email, full_name: fullName, role: newRole, username: email.split("@")[0] }),
  })

  return json({ ok: true, id: created.id, email, role: newRole })
})
