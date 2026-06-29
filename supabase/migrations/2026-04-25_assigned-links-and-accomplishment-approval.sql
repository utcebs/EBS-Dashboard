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
