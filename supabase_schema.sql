-- ============================================================
-- EBS PROJECT TRACKER — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. PROJECTS TABLE (Primary data — admin editable)
CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  project_number INTEGER UNIQUE,
  project_name TEXT NOT NULL,
  objective TEXT,
  dept_module TEXT,
  business_owner TEXT,
  priority TEXT CHECK (priority IN ('Critical','High','Medium','Low')),
  status TEXT CHECK (status IN ('On Track','At Risk','Delayed','Completed','On Hold')),
  phase TEXT CHECK (phase IN ('Initiation','Planning','Execution','UAT','Go-Live','Closed')),
  est_start TEXT,
  est_end TEXT,
  start_date TEXT,
  end_date TEXT,
  percent_complete TEXT,
  total_cost_kwd NUMERIC DEFAULT 0,
  business_impact TEXT CHECK (business_impact IN ('High','Medium','Low')),
  cost_remarks TEXT,
  dependencies TEXT,
  key_risks TEXT,
  mitigation TEXT,
  notes_updates TEXT,
  actions_needed TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. MILESTONES TABLE (Sub-tasks per project — admin editable)
CREATE TABLE milestones (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  milestone_number INTEGER,
  deliverable TEXT NOT NULL,
  target_date TEXT,
  actual_date TEXT,
  est_start_date DATE,
  actual_end_date DATE,
  development_status TEXT CHECK (development_status IN ('Not Started','In Progress','Completed','Blocked')),
  uat_status TEXT CHECK (uat_status IN ('Not Started','Pending','In Progress','Passed','Failed')),
  dependencies TEXT,
  owner TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RISKS TABLE (Risks & Issues per project — admin editable)
CREATE TABLE risks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  risk_number INTEGER,
  description TEXT NOT NULL,
  impact TEXT CHECK (impact IN ('High','Medium','Low')),
  likelihood TEXT CHECK (likelihood IN ('High','Medium','Low')),
  mitigation_action TEXT,
  owner TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3a. DELAY REASONS TABLE (per-project slip log — admin editable)
CREATE TABLE delay_reasons (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reason_number INTEGER,
  reason TEXT NOT NULL,
  recorded_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AUTO-UPDATE TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER milestones_updated_at BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER risks_updated_at BEFORE UPDATE ON risks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER delay_reasons_updated_at BEFORE UPDATE ON delay_reasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. ROW LEVEL SECURITY
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE delay_reasons ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can view)
CREATE POLICY "public_read_projects" ON projects FOR SELECT USING (true);
CREATE POLICY "public_read_milestones" ON milestones FOR SELECT USING (true);
CREATE POLICY "public_read_risks" ON risks FOR SELECT USING (true);
CREATE POLICY "public_read_delay_reasons" ON delay_reasons FOR SELECT USING (true);

-- Authenticated users (admins) can do everything
CREATE POLICY "admin_insert_projects" ON projects FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin_update_projects" ON projects FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "admin_delete_projects" ON projects FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "admin_insert_milestones" ON milestones FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin_update_milestones" ON milestones FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "admin_delete_milestones" ON milestones FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "admin_insert_risks" ON risks FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin_update_risks" ON risks FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "admin_delete_risks" ON risks FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "admin_insert_delay_reasons" ON delay_reasons FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin_update_delay_reasons" ON delay_reasons FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "admin_delete_delay_reasons" ON delay_reasons FOR DELETE USING (auth.role() = 'authenticated');

-- 6. INDEXES FOR PERFORMANCE
CREATE INDEX idx_milestones_project_id ON milestones(project_id);
CREATE INDEX idx_risks_project_id ON risks(project_id);
CREATE INDEX idx_delay_reasons_project_id ON delay_reasons(project_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_priority ON projects(priority);

-- 7. LANDING PAGE CONTENT (singleton table; see supabase/migrations/2026-04-23_landing-and-tracker.sql)
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
ALTER TABLE landing_page_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_landing" ON landing_page_content FOR SELECT USING (true);
CREATE POLICY "admin_update_landing" ON landing_page_content FOR UPDATE USING (auth.role() = 'authenticated');
