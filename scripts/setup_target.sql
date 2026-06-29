-- ============================================================
-- COMBINED SETUP — EBS Projects + EBS Tracker (Single Supabase)
-- Run this ONCE on a fresh Supabase project in SQL Editor.
-- ============================================================
-- After running:
--   1. Disable "Email Confirmations" in Supabase Auth → Settings
--      (so users can log in immediately after creation)
--   2. Create your first admin user from the Supabase Dashboard →
--      Authentication → Users → Add User, then run:
--      INSERT INTO profiles (id, full_name, role, email)
--      VALUES ('<uuid-from-auth>', 'Administrator', 'admin', 'admin@yourco.com');
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Helper: auto-update updated_at ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Same function aliased for project website triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════
-- SHARED IDENTITY: profiles
-- Replaces the custom 'users' table. Links to Supabase Auth.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL DEFAULT '',
  username    TEXT        UNIQUE,
  role        TEXT        DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  email       TEXT        DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Auto-create a profile row whenever a new Supabase Auth user is created
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();


-- ═══════════════════════════════════════════════════════════
-- PROJECT WEBSITE TABLES
-- ═══════════════════════════════════════════════════════════

-- 1. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS projects (
  id                BIGSERIAL PRIMARY KEY,
  project_number    INTEGER UNIQUE,
  proj_unique_id    TEXT UNIQUE,
  project_name      TEXT NOT NULL,
  objective         TEXT,
  dept_module       TEXT,
  business_owner    TEXT,
  priority          TEXT CHECK (priority IN ('Critical','High','Medium','Low')),
  status            TEXT CHECK (status IN ('On Track','At Risk','Delayed','Completed','On Hold')),
  phase             TEXT CHECK (phase IN ('Initiation','Planning','Execution','UAT','Go-Live','Closed')),
  est_start         TEXT,
  est_end           TEXT,
  start_date        TEXT,
  end_date          TEXT,
  percent_complete  TEXT,
  total_cost_kwd    NUMERIC DEFAULT 0,
  business_impact   TEXT CHECK (business_impact IN ('High','Medium','Low')),
  cost_remarks      TEXT,
  dependencies      TEXT,
  key_risks         TEXT,
  mitigation        TEXT,
  notes_updates     TEXT,
  actions_needed    TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate proj_unique_id on insert (format: Proj-YYYY-NNN)
CREATE OR REPLACE FUNCTION generate_proj_unique_id()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  new_id   TEXT;
  counter  INTEGER := 0;
BEGIN
  IF NEW.proj_unique_id IS NULL THEN
    year_str := EXTRACT(YEAR FROM NOW())::TEXT;
    new_id   := 'Proj-' || year_str || '-' || LPAD(COALESCE(NEW.project_number, 1)::TEXT, 3, '0');
    -- Guarantee uniqueness
    WHILE EXISTS (SELECT 1 FROM projects WHERE proj_unique_id = new_id) LOOP
      counter  := counter + 1;
      new_id   := 'Proj-' || year_str || '-' || LPAD((COALESCE(NEW.project_number, 1) + counter)::TEXT, 3, '0');
    END LOOP;
    NEW.proj_unique_id := new_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_proj_unique_id ON projects;
CREATE TRIGGER set_proj_unique_id
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION generate_proj_unique_id();

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. MILESTONES TABLE
CREATE TABLE IF NOT EXISTS milestones (
  id                  BIGSERIAL PRIMARY KEY,
  project_id          BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  milestone_number    INTEGER,
  deliverable         TEXT NOT NULL,
  target_date         TEXT,
  actual_date         TEXT,
  est_start_date      DATE,
  actual_end_date     DATE,
  development_status  TEXT CHECK (development_status IN ('Not Started','In Progress','Completed','Blocked')),
  uat_status          TEXT CHECK (uat_status IN ('Not Started','Pending','In Progress','Passed','Failed')),
  dependencies        TEXT,
  owner               TEXT,
  remarks             TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS milestones_updated_at ON milestones;
CREATE TRIGGER milestones_updated_at BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. RISKS TABLE
CREATE TABLE IF NOT EXISTS risks (
  id                BIGSERIAL PRIMARY KEY,
  project_id        BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  risk_number       INTEGER,
  description       TEXT NOT NULL,
  impact            TEXT CHECK (impact IN ('High','Medium','Low')),
  likelihood        TEXT CHECK (likelihood IN ('High','Medium','Low')),
  mitigation_action TEXT,
  owner             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS risks_updated_at ON risks;
CREATE TRIGGER risks_updated_at BEFORE UPDATE ON risks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3a. DELAY REASONS TABLE — per-project slip log
CREATE TABLE IF NOT EXISTS delay_reasons (
  id              BIGSERIAL PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reason_number   INTEGER,
  reason          TEXT NOT NULL,
  recorded_date   DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS delay_reasons_updated_at ON delay_reasons;
CREATE TRIGGER delay_reasons_updated_at BEFORE UPDATE ON delay_reasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_delay_reasons_project ON delay_reasons(project_id);

-- RLS for project website tables
ALTER TABLE projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE delay_reasons ENABLE ROW LEVEL SECURITY;

-- Public read (anyone can view project website)
DROP POLICY IF EXISTS "public_read_projects" ON projects;
CREATE POLICY "public_read_projects"      ON projects      FOR SELECT USING (true);
DROP POLICY IF EXISTS "public_read_milestones" ON milestones;
CREATE POLICY "public_read_milestones"    ON milestones    FOR SELECT USING (true);
DROP POLICY IF EXISTS "public_read_risks" ON risks;
CREATE POLICY "public_read_risks"         ON risks         FOR SELECT USING (true);
DROP POLICY IF EXISTS "public_read_delay_reasons" ON delay_reasons;
CREATE POLICY "public_read_delay_reasons" ON delay_reasons FOR SELECT USING (true);

-- Only authenticated users (admins) can write
DROP POLICY IF EXISTS "admin_insert_projects" ON projects;
CREATE POLICY "admin_insert_projects" ON projects FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "admin_update_projects" ON projects;
CREATE POLICY "admin_update_projects" ON projects FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "admin_delete_projects" ON projects;
CREATE POLICY "admin_delete_projects" ON projects FOR DELETE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admin_insert_milestones" ON milestones;
CREATE POLICY "admin_insert_milestones" ON milestones FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "admin_update_milestones" ON milestones;
CREATE POLICY "admin_update_milestones" ON milestones FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "admin_delete_milestones" ON milestones;
CREATE POLICY "admin_delete_milestones" ON milestones FOR DELETE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admin_insert_risks" ON risks;
CREATE POLICY "admin_insert_risks" ON risks FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "admin_update_risks" ON risks;
CREATE POLICY "admin_update_risks" ON risks FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "admin_delete_risks" ON risks;
CREATE POLICY "admin_delete_risks" ON risks FOR DELETE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admin_insert_delay_reasons" ON delay_reasons;
CREATE POLICY "admin_insert_delay_reasons" ON delay_reasons FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "admin_update_delay_reasons" ON delay_reasons;
CREATE POLICY "admin_update_delay_reasons" ON delay_reasons FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "admin_delete_delay_reasons" ON delay_reasons;
CREATE POLICY "admin_delete_delay_reasons" ON delay_reasons FOR DELETE USING (auth.role() = 'authenticated');


-- ═══════════════════════════════════════════════════════════
-- EBS TRACKER TABLES
-- ═══════════════════════════════════════════════════════════

-- 4. TASK LOGS — core work logging
--    user_id references profiles (= Supabase Auth UUID)
--    linked_project_id optionally links to a project's proj_unique_id
CREATE TABLE IF NOT EXISTS task_logs (
  id               UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_member      TEXT          NOT NULL,
  log_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
  month            TEXT          NOT NULL,
  week_number      INTEGER       NOT NULL,
  task_project     TEXT          NOT NULL,
  task_description TEXT          DEFAULT '',
  category         TEXT          NOT NULL CHECK (category IN ('Support', 'Testing', 'Project')),
  sub_category     TEXT          DEFAULT '',
  hours_spent      NUMERIC(5,2)  NOT NULL CHECK (hours_spent > 0 AND hours_spent <= 24),
  accomplishment   TEXT          DEFAULT '',
  comments_notes   TEXT          DEFAULT '',
  is_completed     BOOLEAN       DEFAULT FALSE,
  linked_project_id TEXT         REFERENCES projects(proj_unique_id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_logs_user_id          ON task_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_log_date         ON task_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_task_logs_category         ON task_logs(category);
CREATE INDEX IF NOT EXISTS idx_task_logs_month            ON task_logs(month);
CREATE INDEX IF NOT EXISTS idx_task_logs_linked_project   ON task_logs(linked_project_id);
ALTER TABLE task_logs DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_task_logs_updated_at ON task_logs;
CREATE TRIGGER update_task_logs_updated_at
  BEFORE UPDATE ON task_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. PRIORITY TASKS
CREATE TABLE IF NOT EXISTS priority_tasks (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID        REFERENCES profiles(id),
  title       TEXT        NOT NULL,
  priority    TEXT        NOT NULL CHECK (priority IN ('Urgent', 'Important', 'Medium', 'Low')),
  due_date    DATE,
  status      TEXT        DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'logged')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_priority_tasks_user_id ON priority_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_priority_tasks_status  ON priority_tasks(status);
ALTER TABLE priority_tasks DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_priority_tasks_updated_at ON priority_tasks;
CREATE TRIGGER update_priority_tasks_updated_at
  BEFORE UPDATE ON priority_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. APP SETTINGS
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL DEFAULT '',
  label      TEXT,
  updated_by UUID        REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

INSERT INTO app_settings (key, value, label) VALUES
  ('war_days_off',              '0',          'War Days Off (legacy)'),
  ('tracker_start_date',        '2026-03-03', 'Tracker Start Date'),
  ('category_name_support',     'Support',    'Support Category Label'),
  ('category_name_testing',     'Testing',    'Testing Category Label'),
  ('category_name_project',     'Project',    'Project Category Label'),
  ('emailjs_service_id',        '',           'EmailJS Service ID'),
  ('emailjs_template_id',       '',           'EmailJS Template ID'),
  ('emailjs_public_key',        '',           'EmailJS Public Key'),
  ('project_link_mandatory',    'false',      'Require project link when logging tasks')
ON CONFLICT (key) DO NOTHING;

-- 7. SUB-CATEGORIES
CREATE TABLE IF NOT EXISTS support_subcategories (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  sort_order INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE support_subcategories DISABLE ROW LEVEL SECURITY;
INSERT INTO support_subcategories (name, sort_order) VALUES
  ('User Support', 1), ('D365 User Support', 2), ('Report Support', 3)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS testing_subcategories (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  sort_order INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE testing_subcategories DISABLE ROW LEVEL SECURITY;
INSERT INTO testing_subcategories (name, sort_order) VALUES
  ('Hardware Testing', 1), ('Software Testing', 2)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS project_subcategories (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  sort_order INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE project_subcategories DISABLE ROW LEVEL SECURITY;
INSERT INTO project_subcategories (name, sort_order) VALUES
  ('Development', 1), ('Implementation', 2), ('Planning', 3), ('Documentation', 4)
ON CONFLICT (name) DO NOTHING;

-- 8. EMPLOYEE LEAVES
CREATE TABLE IF NOT EXISTS employee_leaves (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE        NOT NULL,
  end_date   DATE        NOT NULL,
  reason     TEXT        DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_user_id ON employee_leaves(user_id);
ALTER TABLE employee_leaves DISABLE ROW LEVEL SECURITY;

-- 9. WAR DAY RANGES
CREATE TABLE IF NOT EXISTS war_day_ranges (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  start_date DATE        NOT NULL,
  end_date   DATE        NOT NULL,
  label      TEXT        DEFAULT 'War / Conflict',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE war_day_ranges DISABLE ROW LEVEL SECURITY;


-- 10. LANDING PAGE CONTENT (singleton) + profile extensions + priority_tasks on-hold
-- Canonical migration: supabase/migrations/2026-04-23_landing-and-tracker.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS landing_page_content (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hero_title TEXT,
  hero_subtitle TEXT,
  description TEXT,
  achievements JSONB,
  vision TEXT,
  footer_text TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
INSERT INTO landing_page_content (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE landing_page_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_landing" ON landing_page_content;
DROP POLICY IF EXISTS "public_read_landing" ON landing_page_content;
CREATE POLICY "public_read_landing" ON landing_page_content FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_update_landing" ON landing_page_content;
DROP POLICY IF EXISTS "admin_update_landing" ON landing_page_content;
CREATE POLICY "admin_update_landing" ON landing_page_content FOR UPDATE USING (auth.role() = 'authenticated');

-- profiles — extra columns used by the landing page team section
-- + employee_roles (free-form job-role chips, separate from `role`
--   which is the application permission user/admin)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS display_order INT,
  ADD COLUMN IF NOT EXISTS show_on_landing BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_team_lead BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS employee_roles TEXT[] DEFAULT '{}';

-- priority_tasks — on-hold status + reason tracking
ALTER TABLE priority_tasks DROP CONSTRAINT IF EXISTS priority_tasks_status_check;
ALTER TABLE priority_tasks ADD CONSTRAINT priority_tasks_status_check
  CHECK (status IN ('pending', 'on_hold', 'done', 'logged'));
ALTER TABLE priority_tasks
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS hold_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hold_set_by UUID REFERENCES auth.users(id);

-- Also in the Supabase dashboard, create a Storage bucket named `team-photos`
-- (public read, authenticated write) for team member avatar uploads.

-- ── Performance indexes ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_project_id      ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_status       ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority     ON projects(priority);
CREATE INDEX IF NOT EXISTS idx_projects_proj_uid     ON projects(proj_unique_id);


-- ════════════════════════════════════════════════════════════
-- DONE ✅
--
-- Tables created:
--   profiles, projects, milestones, risks,
--   task_logs, priority_tasks, app_settings,
--   support_subcategories, testing_subcategories,
--   project_subcategories, employee_leaves, war_day_ranges
--
-- Next steps:
--   1. In Supabase Dashboard → Auth → Settings:
--      Disable "Enable email confirmations"
--   2. Create your admin user in Auth → Users → Add User
--   3. Then run:
--      INSERT INTO profiles (id, full_name, role, email)
--      VALUES ('<paste-uuid-here>', 'Administrator', 'admin', 'admin@yourco.com');
--   4. Update VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in
--      fresh-repo/.env (project website)
--   5. Update SUPABASE_URL and SUPABASE_ANON_KEY in
--      work-tracker/js/config.js (EBS Tracker)
-- ════════════════════════════════════════════════════════════

-- ============================================================
-- MIGRATIONS (applied in chronological order)
-- ============================================================

-- ── 2026-04-23_landing-and-tracker.sql ──
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
DROP POLICY IF EXISTS "public_read_landing" ON landing_page_content;
CREATE POLICY "public_read_landing" ON landing_page_content
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_update_landing" ON landing_page_content;
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

-- ── 2026-04-24_categories-badges-doneat.sql ──
-- ─────────────────────────────────────────────────────────────
-- Migration: 2026-04-24
-- Phases 4 + 5 + 6 of the April rework
--
-- 4. Admin-managed categories + subcategories (replace hardcoded
--    Support/Testing/Project + their three subcategory tables).
-- 5. priority_tasks.done_at column for assigned-task analytics.
-- 6. Admin-defined badges with auto-assignment + per-user earned rows.
--
-- Run this against the REAL Supabase project: hddfkkojfvmjuxsyhcgh
-- (NOT alqvknnpgcrupxtomcdv — see memory.md §13).
-- The legacy support/testing/project_subcategories tables are kept
-- in place for rollback; nothing drops old data here.
-- ─────────────────────────────────────────────────────────────


-- ── 4. Categories ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  icon        TEXT,
  sort_order  INTEGER     DEFAULT 0,
  is_active   BOOLEAN     DEFAULT TRUE,
  is_system   BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS subcategories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  sort_order  INTEGER     DEFAULT 0,
  is_active   BOOLEAN     DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, name)
);
ALTER TABLE subcategories DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subcategories_cat ON subcategories(category_id);

-- Seed the three system categories so existing task_logs (which reference
-- category by name string) still resolve.
INSERT INTO categories (name, icon, sort_order, is_system) VALUES
  ('Support', '🛡️', 1, TRUE),
  ('Testing', '🧪', 2, TRUE),
  ('Project', '🚀', 3, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Copy existing subcategories into the new table. Idempotent.
INSERT INTO subcategories (category_id, name, sort_order)
SELECT c.id, s.name, COALESCE(s.sort_order, 0)
FROM support_subcategories s
JOIN categories c ON c.name = 'Support'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO subcategories (category_id, name, sort_order)
SELECT c.id, s.name, COALESCE(s.sort_order, 0)
FROM testing_subcategories s
JOIN categories c ON c.name = 'Testing'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO subcategories (category_id, name, sort_order)
SELECT c.id, s.name, COALESCE(s.sort_order, 0)
FROM project_subcategories s
JOIN categories c ON c.name = 'Project'
ON CONFLICT (category_id, name) DO NOTHING;


-- ── 5. priority_tasks.done_at ────────────────────────────────
ALTER TABLE priority_tasks
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

-- Backfill: existing done/logged rows get done_at = updated_at so the
-- analytics card isn't blank on day one.
UPDATE priority_tasks
SET done_at = updated_at
WHERE done_at IS NULL AND status IN ('done', 'logged');


-- ── 6. Badges ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS badges (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  description      TEXT,
  icon             TEXT,
  condition_type   TEXT        NOT NULL,
  -- condition_type values:
  --   'total_hours'       -> {"threshold": 100}
  --   'consecutive_days'  -> {"threshold": 7}
  --   'category_count'    -> {"category_id": "<uuid>", "threshold": 20}
  --   'on_time_rate'      -> {"threshold_pct": 90, "min_tasks": 10}
  --   'custom'            -> free-form (evaluator returns false for now)
  condition_config JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_active        BOOLEAN     DEFAULT TRUE,
  created_by       UUID        REFERENCES profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE badges DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS user_badges (
  user_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id  UUID        NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);
ALTER TABLE user_badges DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

-- Seed a few starter badges so the UI isn't empty on first install.
INSERT INTO badges (name, description, icon, condition_type, condition_config) VALUES
  ('Century',      'Logged 100+ hours',                 '💯', 'total_hours',      '{"threshold": 100}'::jsonb),
  ('Iron Worker',  '7 working days in a row',           '🔥', 'consecutive_days', '{"threshold": 7}'::jsonb),
  ('Marathoner',   'Logged 250+ hours',                 '🏃', 'total_hours',      '{"threshold": 250}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── 2026-04-25_assigned-links-and-accomplishment-approval.sql ──
-- ─────────────────────────────────────────────────────────────
-- Migration: 2026-04-25
-- Follow-up after the April rework
--
-- A. priority_tasks.linked_project_id — admin can link an assigned task
--    to a project so the analytics dashboard shows where the work landed.
-- B. task_logs accomplishment approval workflow — admin must approve a
--    user-entered Key Accomplishment before it's counted in stats or
--    visible publicly. Hours / category still count immediately.
--
-- Run against the REAL Supabase project: hddfkkojfvmjuxsyhcgh
-- (NOT alqvknnpgcrupxtomcdv — see memory.md §13).
-- ─────────────────────────────────────────────────────────────


-- ── A. Project link on assigned tasks ────────────────────────
ALTER TABLE priority_tasks
  ADD COLUMN IF NOT EXISTS linked_project_id TEXT
    REFERENCES projects(proj_unique_id) ON DELETE SET NULL;


-- ── B. Accomplishment approval workflow ──────────────────────
-- Default 'approved' so existing accomplishments stay visible and
-- counted. Client inserts new rows with status='pending' only when
-- the accomplishment field is non-empty. Admin flips to 'approved'
-- or 'rejected' (with a reason) from the new admin tab.
ALTER TABLE task_logs
  ADD COLUMN IF NOT EXISTS accomplishment_status TEXT DEFAULT 'approved'
    CHECK (accomplishment_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_by      UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Speeds up the "Pending Approvals" tab. Partial index — only the
-- pending rows are indexed, so the index stays tiny.
CREATE INDEX IF NOT EXISTS idx_task_logs_accomplishment_status
  ON task_logs(accomplishment_status)
  WHERE accomplishment_status = 'pending';

-- ── 2026-04-26_task-log-priority-link.sql ──
-- ─────────────────────────────────────────────────────────────
-- Migration: 2026-04-26
-- Link task_logs back to the priority_task they were logged against,
-- so admin views (e.g. Task Completion Analysis drill-down) can show
-- the comments/notes the employee wrote per assignment.
--
-- Backfill is best-effort: matches assigned priority_tasks by
-- (user_id, title==task_project). Imperfect when an employee has
-- multiple priority_tasks with the same title, but good enough to
-- light up the historical data on day one.
--
-- Run against project hddfkkojfvmjuxsyhcgh.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE task_logs
  ADD COLUMN IF NOT EXISTS priority_task_id UUID
    REFERENCES priority_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_logs_priority_task
  ON task_logs(priority_task_id)
  WHERE priority_task_id IS NOT NULL;

-- Best-effort backfill for assigned tasks only.
UPDATE task_logs tl
SET priority_task_id = pt.id
FROM priority_tasks pt
WHERE tl.priority_task_id IS NULL
  AND pt.assigned_by IS NOT NULL
  AND tl.user_id      = pt.user_id
  AND tl.task_project = pt.title;

-- ── 2026-05-01_employee-roles.sql ──
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

-- ── 2026-05-06_delay-reasons.sql ──
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
DROP POLICY IF EXISTS "delay_reasons_select_all" ON delay_reasons;
CREATE POLICY "delay_reasons_select_all" ON delay_reasons
  FOR SELECT USING (true);

-- Only logged-in users (admins in this app) can write
DROP POLICY IF EXISTS "delay_reasons_insert_auth" ON delay_reasons;
CREATE POLICY "delay_reasons_insert_auth" ON delay_reasons
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "delay_reasons_update_auth" ON delay_reasons;
CREATE POLICY "delay_reasons_update_auth" ON delay_reasons
  FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "delay_reasons_delete_auth" ON delay_reasons;
CREATE POLICY "delay_reasons_delete_auth" ON delay_reasons
  FOR DELETE USING (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';

-- ── 2026-05-06_milestone-est-start-actual-end.sql ──
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

-- ── 2026-05-11_project-est-end.sql ──
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


-- ============================================================
-- HELPER FUNCTION FOR CLONE SCRIPT
-- Allows the Node clone script (using service_role) to insert
-- placeholder auth.users records with specific UUIDs, so that
-- FK constraints from profiles → auth.users are satisfied.
-- These accounts can't be logged into (random password).
-- ============================================================
CREATE OR REPLACE FUNCTION clone_auth_user(p_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role,
    created_at, updated_at
  ) VALUES (
    p_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Reload PostgREST schema cache so the function is callable via /rpc
NOTIFY pgrst, 'reload schema';
