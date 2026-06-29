-- ============================================================
-- Migration: Landing page + Team extensions + On-hold tasks
-- Date: 2026-04-23
-- ============================================================
-- Run in Supabase SQL Editor.
--
-- Prerequisites: `profiles` and `priority_tasks` must already exist
-- (they're created by COMBINED_SETUP.sql). This migration:
--   • Creates `landing_page_content` from scratch (no deps on user tables).
--   • Extends `profiles` with team-section columns (skipped if missing).
--   • Extends `priority_tasks` with on-hold columns (skipped if missing).
-- Missing tables will raise a NOTICE in the output, not an ERROR.
--
-- Also: Create Storage bucket `team-photos` (public read, authenticated
--       write) manually in Supabase Dashboard → Storage.
-- ============================================================

-- A. Landing page content — singleton row, admin-editable
-- ============================================================
CREATE TABLE IF NOT EXISTS landing_page_content (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hero_title TEXT DEFAULT 'Enterprise Business Solutions',
  hero_subtitle TEXT DEFAULT 'Powering the backbone of our business',
  description TEXT DEFAULT 'The EBS department delivers and sustains the enterprise systems that keep the business moving — from ERP to e-commerce, reporting, and integrations. (Admin can edit this paragraph inline.)',
  achievements JSONB DEFAULT '[
    {"label":"Projects Delivered","value":"50+","icon":"🏆"},
    {"label":"Years of Service","value":"10+","icon":"📅"},
    {"label":"Systems Integrated","value":"25+","icon":"🔗"}
  ]'::jsonb,
  vision TEXT DEFAULT 'To be the technology backbone that enables every part of the business to move faster, decide smarter, and serve customers better. (Admin can edit this paragraph inline.)',
  footer_text TEXT DEFAULT '© 2026 EBS Department — Enterprise Business Solutions',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO landing_page_content (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE landing_page_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_landing" ON landing_page_content;
CREATE POLICY "public_read_landing" ON landing_page_content
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_update_landing" ON landing_page_content;
CREATE POLICY "admin_update_landing" ON landing_page_content
  FOR UPDATE USING (auth.role() = 'authenticated');


-- B. Extend profiles for team section on landing page
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS job_title TEXT,
      ADD COLUMN IF NOT EXISTS bio TEXT,
      ADD COLUMN IF NOT EXISTS display_order INT,
      ADD COLUMN IF NOT EXISTS show_on_landing BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_team_lead BOOLEAN DEFAULT false;
    RAISE NOTICE 'profiles: landing-page columns added (or already present)';
  ELSE
    RAISE NOTICE 'SKIPPED: profiles table does not exist in schema public. Run COMBINED_SETUP.sql first, then re-run this migration.';
  END IF;
END$$;


-- C. Extend priority_tasks for on-hold status + reason
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename = 'priority_tasks'
  ) THEN
    ALTER TABLE priority_tasks DROP CONSTRAINT IF EXISTS priority_tasks_status_check;
    ALTER TABLE priority_tasks
      ADD CONSTRAINT priority_tasks_status_check
        CHECK (status IN ('pending', 'on_hold', 'done', 'logged'));
    ALTER TABLE priority_tasks
      ADD COLUMN IF NOT EXISTS hold_reason TEXT,
      ADD COLUMN IF NOT EXISTS hold_set_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS hold_set_by UUID REFERENCES auth.users(id);
    RAISE NOTICE 'priority_tasks: on-hold columns + constraint added (or already present)';
  ELSE
    RAISE NOTICE 'SKIPPED: priority_tasks table does not exist in schema public. Run COMBINED_SETUP.sql first, then re-run this migration.';
  END IF;
END$$;


-- ============================================================
-- Manual post-steps (do in Supabase Dashboard):
-- 1. Storage → New bucket `team-photos`:
--      • Public bucket (read)
--      • Only authenticated users can upload (write policy)
-- 2. Mark at least one profile as `is_team_lead = true` and
--    four profiles total with `show_on_landing = true` to see
--    the team section rendered on the landing page.
-- ============================================================
