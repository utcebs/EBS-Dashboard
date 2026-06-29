-- ─────────────────────────────────────────────────────────────
-- Migration: 2026-05-06
-- Adds two new date fields to milestones so admins can record the
-- planned start AND the actual end — pairing with the existing
-- target_date / actual_date pair. These four columns together let
-- a future dashboard visual show plan-vs-actual variance per
-- milestone.
--
-- Both columns are DATE (full YYYY-MM-DD) to match the existing
-- milestone date fields' precision (the milestone form uses
-- <input type="date">). Projects use TEXT 'YYYY-MM' instead.
--
-- Run against the REAL Supabase project: hddfkkojfvmjuxsyhcgh.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS est_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_end_date DATE;

NOTIFY pgrst, 'reload schema';
