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
