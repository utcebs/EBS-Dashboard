import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hddfkkojfvmjuxsyhcgh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZGZra29qZnZtanV4c3loY2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDI1MjksImV4cCI6MjA5MjI3ODUyOX0.2EYGf2PPBDpkkY1d2Rp87GY5so05ehx6a0sYfCXHe1Q'

// Main client — used for auth (sign-in, session) and admin writes.
// Persists the user's session in localStorage.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Public read-only client — bypasses the auth machinery entirely so public
// SELECTs never get blocked by a stale or cross-app session in localStorage.
// The EBS Tracker and main app share a Supabase project; when a user logs
// into one app their session appears in localStorage for the other, and the
// shared auth state was causing the first query after navigation to hang
// silently (no network request, no error). This second client has its own
// isolated storage key and does not persist sessions.
export const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-public-readonly',
  },
})
