-- ─────────────────────────────────────────────────────────────
-- Migration: 2026-05-11
-- Adds an estimated end date to projects so the original plan
-- (est_start + est_end) can be compared against the actual
-- (start_date + end_date) in the form / detail header / Gantt.
--
-- est_start already exists from the initial schema; this just
-- adds its counterpart so the pair is complete. Same TEXT
-- 'YYYY-MM' format.
--
-- Run against the REAL Supabase project: hddfkkojfvmjuxsyhcgh.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS est_end TEXT;

NOTIFY pgrst, 'reload schema';
