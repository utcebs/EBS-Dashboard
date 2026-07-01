-- Privilege-escalation guard for profiles.role — RLS-free.
-- Closes two escalation paths that exist because RLS is disabled on profiles:
--   1. Anon/console: supabase.from('profiles').update({role:'admin'})
--   2. Signup metadata: signUp({options:{data:{role:'admin'}}}) → handle_new_auth_user
-- A BEFORE INSERT/UPDATE trigger fires regardless of RLS and only touches the
-- `role` column, so it does NOT affect the anonymous reads the apps rely on.
-- role may only be set to a privileged value, or changed, by an existing admin.

create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare caller_is_admin boolean;
begin
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') into caller_is_admin;
  if tg_op = 'INSERT' then
    if coalesce(new.role,'user') <> 'user' and not caller_is_admin then
      new.role := 'user';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not caller_is_admin then
      raise exception 'Changing role requires admin privileges';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role before insert or update on public.profiles
for each row execute function public.guard_profile_role();
