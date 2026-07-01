-- Lock writes (INSERT/UPDATE/DELETE) while keeping reads public.
-- Motivation: RLS was disabled on the tracker tables + profiles, so the public
-- anon key could edit/delete everything. This enables RLS with a public SELECT
-- policy on every table (reads unchanged) and write policies scoped to
-- owner/admin. Verified live: anon writes blocked, reads 200, authed flows OK.
-- Reversible per-table via: alter table <t> disable row level security;

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ── profiles: self-or-admin writes (role changes additionally blocked by trigger) ──
alter table public.profiles enable row level security;
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert with check (auth.uid() = id or public.is_admin());
create policy profiles_update on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());
create policy profiles_delete on public.profiles for delete using (public.is_admin());

-- ── owner-or-admin tables (have user_id) ──
do $$
declare t text;
begin
  foreach t in array array['task_logs','priority_tasks','employee_leaves','user_badges'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for select using (true)', t||'_read', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id or public.is_admin())', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id or public.is_admin())', t||'_del', t);
  end loop;
end $$;

-- ── admin-only sensitive config ──
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
drop policy if exists app_settings_ins  on public.app_settings;
drop policy if exists app_settings_upd  on public.app_settings;
drop policy if exists app_settings_del  on public.app_settings;
create policy app_settings_read on public.app_settings for select using (true);
create policy app_settings_ins  on public.app_settings for insert with check (public.is_admin());
create policy app_settings_upd  on public.app_settings for update using (public.is_admin()) with check (public.is_admin());
create policy app_settings_del  on public.app_settings for delete using (public.is_admin());

-- ── authenticated-write reference tables (matches the existing projects pattern) ──
do $$
declare t text;
begin
  foreach t in array array['categories','subcategories','support_subcategories','testing_subcategories','project_subcategories','badges','war_day_ranges'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for select using (true)', t||'_read', t);
    execute format('create policy %I on public.%I for insert with check (auth.role() = ''authenticated'')', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using (auth.role() = ''authenticated'')', t||'_del', t);
  end loop;
end $$;

-- ── ai_briefings: tighten the loose anon-insert policy ──
drop policy if exists ai_briefings_write on public.ai_briefings;
create policy ai_briefings_write on public.ai_briefings for insert with check (auth.role() = 'authenticated');
