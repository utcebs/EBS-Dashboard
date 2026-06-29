-- ─────────────────────────────────────────────────────────────
-- Migration: 2026-05-06
-- Adds a new `delay_reasons` table for per-project slip tracking.
-- Each row is one admin-logged reason a project's timeline slipped,
-- with a date stamp. Mirrors the milestones / risks pattern: public
-- read, authenticated (admin) write.
--
-- Run against the REAL Supabase project: hddfkkojfvmjuxsyhcgh.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delay_reasons (
  id              BIGSERIAL PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reason_number   INTEGER,
  reason          TEXT NOT NULL,
  recorded_date   DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delay_reasons_project ON delay_reasons(project_id);

ALTER TABLE delay_reasons ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can read
CREATE POLICY "delay_reasons_select_all" ON delay_reasons
  FOR SELECT USING (true);

-- Only logged-in users (admins in this app) can write
CREATE POLICY "delay_reasons_insert_auth" ON delay_reasons
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "delay_reasons_update_auth" ON delay_reasons
  FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "delay_reasons_delete_auth" ON delay_reasons
  FOR DELETE USING (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
