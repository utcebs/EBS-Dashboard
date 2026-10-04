-- ═══════════════════════════════════════════════════════════
-- Deactivating a user
-- ═══════════════════════════════════════════════════════════
-- Until now the only way to stop someone signing in was to delete them, which
-- takes their task logs and their name on every project with them. This flag
-- is the soft version: the row stays, the history stays, the login stops.
--
-- The flag is NOT what blocks the login — the admin-update-user edge function
-- bans the auth.users row through the GoTrue admin API, and that is what the
-- auth server enforces. This column is the part the app can read, so the
-- console can show who is active and the pickers can leave them out.
-- The two are set together, by that one function.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Everyone who already exists is active.
UPDATE public.profiles SET is_active = true WHERE is_active IS NULL;

-- PostgREST caches the schema; without this the new column can 404 from the
-- REST API until the next restart.
NOTIFY pgrst, 'reload schema';
