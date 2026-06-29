-- ============================================================
-- LANDING PAGE SEED — populates About text + Team Members
-- ============================================================
-- Run this AFTER COMBINED_SETUP.sql.
-- This copies the live landing content from the original site
-- so your fork looks identical on first load. You can edit any
-- of it later via the pencil-icon inline editor on the landing.
--
-- Two things this does:
--   1. UPDATE the singleton landing_page_content row (id=1)
--      with hero/About/vision/achievements text.
--   2. INSERT 4 placeholder auth.users + their profiles, with
--      show_on_landing=true so they appear in the Team section.
--      The auth.users entries are display-only — they have no
--      usable password and can never be logged into. You can
--      delete them later via Supabase Dashboard → Auth → Users
--      if you don't want them.
--
-- Note on team photos: avatar_url points at the original site's
-- public Supabase Storage bucket. Photos will load fine, but if
-- the original ever rotates the bucket, you'd need to re-upload
-- via the admin UI's pencil icon on each photo.
-- ============================================================

-- ── 1. Landing page text content ────────────────────────────
UPDATE landing_page_content SET
  hero_title    = ' ',
  hero_subtitle = 'Powering the backbone of our business',
  description   = 'Enterprise Business Solutions is your strategic digital partner, working side by side with every business unit to turn complex operations into streamlined, connected experiences. We don''t just deliver tools—we listen to your goals, understand your challenges, and co‑create solutions that improve efficiency, enhance visibility, and support smarter decisions. Guided by collaboration, transparency, reliability, and innovation, we focus on stable, secure, and scalable digital capabilities that empower teams, optimize workflows, and turn technology into a true enabler of business growth.',
  achievements  = '[{"icon": "🏆", "label": "Digital Backbone", "value": "ERP Implemention"}, {"icon": "📅", "label": "Dream Project", "value": "E-Com Project"}, {"icon": "🔗", "label": "Unified Security", "value": "Sophos Security"}]'::jsonb,
  vision        = 'To lead digital transformation by creating intelligent, connected solutions that simplify work, drive innovation, and keep the business ahead of change. Enterprise Business Solutions strives to empower people and processes through technology that delivers efficiency, agility, and lasting impact.',
  footer_text   = '© 2026 EBS Department — Enterprise Business Solutions'
WHERE id = 1;


-- ── 2. Placeholder auth.users for team display ──────────────
-- These accounts can't be logged into (random password). The
-- on_auth_user_created trigger auto-creates a matching profiles
-- row for each, which step 3 then fills in with the team data.
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, aud, role,
  created_at, updated_at
) VALUES
  ('da24dd30-374e-4906-84ac-8d1510fd94c1', '00000000-0000-0000-0000-000000000000',
   'aamir.placeholder@ebs-upgrade.local', crypt(gen_random_uuid()::text, gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Aamir Amin Syal"}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW()),
  ('c6b6496b-1ae1-42c7-8e22-d6d7697e6e64', '00000000-0000-0000-0000-000000000000',
   'moosa.placeholder@ebs-upgrade.local', crypt(gen_random_uuid()::text, gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Mohammed Moosa"}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW()),
  ('2ef3cd51-9e31-4112-88d1-2d4d077375d7', '00000000-0000-0000-0000-000000000000',
   'jeswin.placeholder@ebs-upgrade.local', crypt(gen_random_uuid()::text, gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Jeswin Davis"}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW()),
  ('bf67c0f7-9d00-4deb-adcf-a4cdf8ac98a7', '00000000-0000-0000-0000-000000000000',
   'thulasi.placeholder@ebs-upgrade.local', crypt(gen_random_uuid()::text, gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Thulasi Gonuguntala"}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;


-- ── 3. Fill in profile display fields ───────────────────────
-- The on_auth_user_created trigger already inserted basic rows.
-- This UPDATE adds the job title, bio, photo, ordering, etc.
UPDATE profiles SET
  full_name       = 'Aamir Amin Syal',
  job_title       = 'Senior Systems Engineer',
  bio             = 'Ensures reliable and secure IT infrastructure by managing servers, networks, cloud systems, and backups while optimizing performance and scalability.',
  avatar_url      = 'https://hddfkkojfvmjuxsyhcgh.supabase.co/storage/v1/object/public/team-photos/da24dd30-374e-4906-84ac-8d1510fd94c1/1776958309697.png',
  display_order   = NULL,
  is_team_lead    = false,
  show_on_landing = true,
  employee_roles  = '[]'::jsonb
WHERE id = 'da24dd30-374e-4906-84ac-8d1510fd94c1';

UPDATE profiles SET
  full_name       = 'Mohammed Moosa',
  job_title       = 'Assistant Project Manager',
  bio             = 'Provides user support across ERP and non-ERP systems including Vansales and Stock take applications. Manages networking, hardware, IT consumables, CCTV, and retail audio-video systems. ',
  avatar_url      = 'https://hddfkkojfvmjuxsyhcgh.supabase.co/storage/v1/object/public/team-photos/c6b6496b-1ae1-42c7-8e22-d6d7697e6e64/1776958319289.jpg',
  display_order   = NULL,
  is_team_lead    = false,
  show_on_landing = true,
  employee_roles  = '[]'::jsonb
WHERE id = 'c6b6496b-1ae1-42c7-8e22-d6d7697e6e64';

UPDATE profiles SET
  full_name       = 'Jeswin Davis',
  job_title       = 'System Engineer',
  bio             = 'Provides ERP functional support, develop Power BI reports, assist retail operations, and drive AI-based process enhancements.',
  avatar_url      = 'https://hddfkkojfvmjuxsyhcgh.supabase.co/storage/v1/object/public/team-photos/2ef3cd51-9e31-4112-88d1-2d4d077375d7/1776938583671.png',
  display_order   = 3,
  is_team_lead    = false,
  show_on_landing = true,
  employee_roles  = '[]'::jsonb
WHERE id = '2ef3cd51-9e31-4112-88d1-2d4d077375d7';

UPDATE profiles SET
  full_name       = 'Thulasi Gonuguntala',
  job_title       = 'Group IT Business Partner',
  bio             = 'Leads EBS Department with strategic vision, driving digital transformation and aligning technology initiatives with business goals.',
  avatar_url      = 'https://hddfkkojfvmjuxsyhcgh.supabase.co/storage/v1/object/public/team-photos/bf67c0f7-9d00-4deb-adcf-a4cdf8ac98a7/1776934746350.jpg',
  display_order   = NULL,
  is_team_lead    = true,
  show_on_landing = true,
  employee_roles  = '[]'::jsonb
WHERE id = 'bf67c0f7-9d00-4deb-adcf-a4cdf8ac98a7';


-- ── 4. Reload PostgREST schema cache (safety net) ───────────
NOTIFY pgrst, 'reload schema';
