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
