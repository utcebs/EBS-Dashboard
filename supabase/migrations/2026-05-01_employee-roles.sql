-- ─────────────────────────────────────────────────────────────
-- Migration: 2026-05-01
-- Adds a free-form employee role array to profiles.
-- The existing `role` column stays as the application permission
-- (user/admin); employee_roles is a separate concept — job titles
-- the admin can attach as removable chips per user.
--
-- Run against the REAL Supabase project: hddfkkojfvmjuxsyhcgh.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS employee_roles TEXT[] DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
