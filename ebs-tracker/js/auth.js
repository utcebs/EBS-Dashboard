// ============================================================
// WorkTracker — Authentication Module (Supabase Auth)
// Uses Supabase email/password auth. Profiles stored in the
// 'profiles' table (linked to Supabase Auth UUID).
// ============================================================

const SESSION_KEY = 'wt_session';

// ── Global error handlers ────────────────────────────────────
// Surface unhandled rejections + uncaught errors as toasts so they
// stop being silent. Throttled so a runaway loop doesn't spam.
// Safe to register here because auth.js loads on every tracker page.
(function () {
  let _lastErrorAt = 0;
  function reportGlobal(label, detail) {
    const now = Date.now();
    if (now - _lastErrorAt < 3000) return;
    _lastErrorAt = now;
    console.error('[global]', label, detail);
    // showToast lives in utils.js which loads after auth.js — guard it.
    try { if (typeof showToast === 'function') showToast(label + ': ' + ((detail && detail.message) || detail || 'unknown error'), 'error'); } catch (e) {}
  }
  window.addEventListener('unhandledrejection', function (e) { reportGlobal('Unhandled rejection', e.reason); });
  window.addEventListener('error', function (e) { reportGlobal('Runtime error', e.error || e.message); });
})();

// ── Login with email + password ───────────────────────────────
async function login(email, password) {
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return { success: false, error: error.message };

    const { data: profile } = await db
      .from('profiles')
      .select('full_name, role, username, avatar_url')
      .eq('id', data.user.id)
      .maybeSingle();

    const session = {
      id:        data.user.id,
      email:     data.user.email,
      username:  profile?.username || data.user.email.split('@')[0],
      fullName:  profile?.full_name || data.user.email.split('@')[0],
      role:      profile?.role || 'user',
      avatar_url: profile?.avatar_url || null,
      loginTime: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { success: true, user: session };
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, error: 'Connection error. Check your Supabase config.' };
  }
}

// ── Logout ────────────────────────────────────────────────────
async function logout() {
  try {
    const { error } = await db.auth.signOut();
    if (error) {
      // User clicked logout — give them logout. But surface the
      // server-side failure so they know the session may still be
      // active in Supabase even though local state is cleared.
      console.warn('signOut error:', error);
      try { if (typeof showToast === 'function') showToast('Sign-out incomplete on server — your session here is cleared', 'warning'); } catch (e) {}
    }
  } catch (e) {
    console.warn('signOut network error:', e);
  }
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

// ── Get current session (sync, from localStorage cache) ───────
function getSession() {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ── Require auth — redirect to login if no session ────────────
function requireAuth() {
  const session = getSession();
  if (!session) { window.location.href = 'index.html'; return null; }
  return session;
}

// ── Require admin — redirect to dashboard if not admin ────────
function requireAdmin() {
  const session = requireAuth();
  if (session && session.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return null;
  }
  return session;
}

// ── Check if current user is admin ────────────────────────────
function isAdmin() {
  const s = getSession();
  return s && s.role === 'admin';
}

// ── Sync session from Supabase ────────────────────────────────
// Called on every page load (index.html) to detect an existing
// Supabase session (e.g. admin already logged in via the project
// website). If found, auto-populates the local wt_session so the
// user skips the login screen.
//
// Returns: the session object if synced, null otherwise.
async function syncSessionFromSupabase() {
  try {
    const { data: { session: supaSession } } = await db.auth.getSession();

    if (!supaSession) {
      // No Supabase session — clear stale local cache if any
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    // Always re-fetch profile to keep avatar_url fresh (admin may have
    // uploaded a new one via the landing team editor since last login).
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, role, username, avatar_url')
      .eq('id', supaSession.user.id)
      .maybeSingle();

    if (!profile) {
      // Auth user exists but no profile in EBS tracker context.
      // Clear only the LOCAL tracker session — DO NOT sign out of Supabase,
      // that would log the user out of the project website too.
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    const local = getSession();

    const session = {
      id:        supaSession.user.id,
      email:     supaSession.user.email,
      username:  profile.username || supaSession.user.email.split('@')[0],
      fullName:  profile.full_name || supaSession.user.email.split('@')[0],
      role:      profile.role || 'user',
      avatar_url: profile.avatar_url || null,
      loginTime: local?.loginTime || new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch (err) {
    console.error('syncSessionFromSupabase error:', err);
    return null;
  }
}
