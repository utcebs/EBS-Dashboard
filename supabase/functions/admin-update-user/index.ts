// Admin-only changes to an existing user: their sign-in email, and whether
// they can sign in at all. Both need the service role — the email lives in
// auth.users (the anon key cannot touch it) and the ban is a GoTrue admin call.
// Only an authenticated user whose profile role is 'admin' may call this.
//
// Body is one of:
//   { id, email: "new@address" }   change the sign-in address
//   { id, active: false }          stop them signing in
//   { id, active: true }           let them sign in again

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

const svc = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) },
  })

// A ban far enough out to be permanent. "none" lifts it.
const FOREVER = "876000h"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS })

  // 1) Caller must be a logged-in admin. Validate their token against Auth,
  //    then check their profile role with the service role.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
  if (!token) return json({ error: "unauthorized" }, 401)
  const meRes = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  if (!meRes.ok) return json({ error: "unauthorized" }, 401)
  const me = await meRes.json()
  const myRole = (await (await svc(`/rest/v1/profiles?id=eq.${me.id}&select=role`)).json())?.[0]?.role
  if (myRole !== "admin") return json({ error: "admin only" }, 403)

  let body: { id?: string; email?: string; active?: boolean }
  try { body = await req.json() } catch { return json({ error: "invalid JSON body" }, 400) }

  const id = (body.id || "").trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "a user id is required" }, 400)

  const target = (await (await svc(`/rest/v1/profiles?id=eq.${id}&select=role,full_name,email`)).json())?.[0]
  if (!target) return json({ error: "no such user" }, 404)

  // ── change the sign-in address ────────────────────────────────────────────
  if (typeof body.email === "string") {
    const email = body.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return json({ error: "that is not a valid email address" }, 400)
    if (email === (target.email || "").toLowerCase()) return json({ ok: true, unchanged: true, email })

    // Someone else holding the address gives a clearer error here than the
    // unique-violation GoTrue would throw.
    const taken = await (await svc(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&id=neq.${id}&select=id`)).json()
    if (Array.isArray(taken) && taken.length) return json({ error: "another user already has that email address" }, 409)

    // The GoTrue admin API is what keeps auth.users and auth.identities in
    // step — writing auth.users.email directly would leave the identity
    // behind it pointing at the old address. email_confirm skips re-
    // verification, which matters because these are internal accounts.
    const up = await svc(`/auth/v1/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({ email, email_confirm: true }),
    })
    const upBody = await up.json()
    if (!up.ok) {
      return json({ error: upBody?.msg || upBody?.error_description || upBody?.error || "could not change the email" }, up.status)
    }

    // profiles.email is a display copy and nothing syncs it — the new-user
    // trigger only fires on INSERT. Without this the console keeps showing
    // the old address while the login is the new one.
    const pr = await svc(`/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ email }) })
    if (!pr.ok) return json({ error: "the sign-in email changed but the profile copy did not: " + (await pr.text()) }, 500)

    return json({ ok: true, id, email })
  }

  // ── stop or restore the ability to sign in ────────────────────────────────
  if (typeof body.active === "boolean") {
    const active = body.active

    // Locking yourself out is a one-way trip — there is no other way back in.
    if (!active && id === me.id) return json({ error: "you cannot deactivate your own account" }, 400)

    if (!active && target.role === "admin") {
      const admins = await (await svc(`/rest/v1/profiles?role=eq.admin&is_active=is.true&select=id`)).json()
      if (Array.isArray(admins) && admins.length <= 1) {
        return json({ error: "that is the last active admin — make someone else an admin first" }, 400)
      }
    }

    const ban = await svc(`/auth/v1/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ban_duration: active ? "none" : FOREVER }),
    })
    if (!ban.ok) {
      const b = await ban.json()
      return json({ error: b?.msg || b?.error || "could not change the sign-in status" }, ban.status)
    }

    // Deactivating also takes them off the landing page — leaving someone who
    // has left the company on the public team section is the whole point of
    // having this. Reactivating does NOT put them back; that is a decision.
    const patch = active
      ? { is_active: true }
      : { is_active: false, show_on_landing: false, is_team_lead: false }
    const pr = await svc(`/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) })
    if (!pr.ok) {
      const t = await pr.text()
      // The is_active column arrives with the 2026-10-04 migration.
      if (/is_active/.test(t)) return json({ error: "the is_active column is missing — run the 2026-10-04 migration" }, 500)
      return json({ error: "sign-in was changed but the profile did not update: " + t }, 500)
    }

    return json({ ok: true, id, active })
  }

  return json({ error: "nothing to do — send an email or an active flag" }, 400)
})
