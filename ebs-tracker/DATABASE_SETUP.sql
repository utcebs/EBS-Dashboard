-- ============================================================
-- EBS Tracker — Complete Database Setup
-- Single file, fresh install. Run once in Supabase SQL Editor.
--
-- After running this file:
--   Default Admin Login → username: admin / password: Admin@123
--   ⚠️  Change the admin password immediately after first login!
-- ============================================================


-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ── Helper: auto-update updated_at ────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────
-- TABLE: users
-- Custom auth (not Supabase Auth). Passwords stored as SHA-256.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  username      TEXT          UNIQUE NOT NULL,
  password_hash TEXT          NOT NULL,
  full_name     TEXT          NOT NULL,
  role          TEXT          DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  email         TEXT          DEFAULT '',
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Default admin: username=admin password=Admin@123
INSERT INTO users (username, password_hash, full_name, role) VALUES (
  'admin',
  'c7ad44cbad762a5da0a452f9e854fdc1e0e7a52a38015f23f3eab1d80b931dd4',
  'Administrator',
  'admin'
) ON CONFLICT (username) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- TABLE: task_logs
-- Core work logging table.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_logs (
  id               UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_logs_user_id   ON task_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_log_date  ON task_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_task_logs_category  ON task_logs(category);
CREATE INDEX IF NOT EXISTS idx_task_logs_month     ON task_logs(month);
ALTER TABLE task_logs DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_task_logs_updated_at ON task_logs;
CREATE TRIGGER update_task_logs_updated_at
  BEFORE UPDATE ON task_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ─────────────────────────────────────────────────────────────
-- TABLE: priority_tasks
-- Personal task board with priorities. Admin can assign to users.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS priority_tasks (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID        REFERENCES users(id),
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


-- ─────────────────────────────────────────────────────────────
-- TABLE: app_settings
-- Key-value store for admin-configurable settings.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL DEFAULT '',
  label      TEXT,
  updated_by UUID        REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

INSERT INTO app_settings (key, value, label) VALUES
  ('war_days_off',          '0',          'War Days Off (legacy, use war_day_ranges)'),
  ('tracker_start_date',    '2026-03-03', 'Tracker Start Date'),
  ('category_name_support', 'Support',    'Support Category Label'),
  ('category_name_testing', 'Testing',    'Testing Category Label'),
  ('category_name_project', 'Project',    'Project Category Label'),
  ('emailjs_service_id',    '',           'EmailJS Service ID'),
  ('emailjs_template_id',   '',           'EmailJS Template ID'),
  ('emailjs_public_key',    '',           'EmailJS Public Key')
ON CONFLICT (key) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- TABLE: support_subcategories
-- Admin-managed sub-categories for Support tasks.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_subcategories (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  sort_order INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE support_subcategories DISABLE ROW LEVEL SECURITY;

INSERT INTO support_subcategories (name, sort_order) VALUES
  ('User Support',      1),
  ('D365 User Support', 2),
  ('Report Support',    3)
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- TABLE: testing_subcategories
-- Admin-managed sub-categories for Testing tasks.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS testing_subcategories (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  sort_order INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE testing_subcategories DISABLE ROW LEVEL SECURITY;

INSERT INTO testing_subcategories (name, sort_order) VALUES
  ('Hardware Testing', 1),
  ('Software Testing', 2)
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- TABLE: project_subcategories
-- Admin-managed sub-categories for Project tasks.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_subcategories (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  sort_order INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE project_subcategories DISABLE ROW LEVEL SECURITY;

INSERT INTO project_subcategories (name, sort_order) VALUES
  ('Development',    1),
  ('Implementation', 2),
  ('Planning',       3),
  ('Documentation',  4)
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- TABLE: employee_leaves
-- Per-employee approved leave date ranges.
-- These dates are excluded from each user's working day count.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_leaves (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE        NOT NULL,
  end_date   DATE        NOT NULL,
  reason     TEXT        DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_user_id ON employee_leaves(user_id);
ALTER TABLE employee_leaves DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- TABLE: war_day_ranges
-- Team-wide date ranges when the office was closed (war/conflict).
-- Affects ALL users' working day counts equally.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS war_day_ranges (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  start_date DATE        NOT NULL,
  end_date   DATE        NOT NULL,
  label      TEXT        DEFAULT 'War / Conflict',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE war_day_ranges DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- DONE ✅
-- Tables created:
--   users, task_logs, priority_tasks, app_settings,
--   support_subcategories, testing_subcategories,
--   project_subcategories, employee_leaves, war_day_ranges
--
-- Default login:
--   Username : admin
--   Password : Admin@123
-- ─────────────────────────────────────────────────────────────
