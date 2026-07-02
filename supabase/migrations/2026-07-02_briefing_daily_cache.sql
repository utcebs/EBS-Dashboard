-- Daily Briefing: tag each cached briefing with the day it is for. The `ai`
-- edge function uses this to generate today's briefing exactly once (auto mode,
-- shared by everyone / stampede-safe) and lets admins force a fresh one.
alter table public.ai_briefings add column if not exists briefing_date date;
update public.ai_briefings set briefing_date = (generated_at at time zone 'Asia/Kuwait')::date where briefing_date is null;
create index if not exists ai_briefings_date_idx on public.ai_briefings(briefing_date);
