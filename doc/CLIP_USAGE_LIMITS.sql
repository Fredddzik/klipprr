-- Klipprr monthly clip usage tracking + reservation RPC
-- Run this in Supabase SQL editor.

create table if not exists public.clip_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  clips_used integer not null default 0 check (clips_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

create index if not exists clip_usage_monthly_period_start_idx
  on public.clip_usage_monthly(period_start);

alter table public.clip_usage_monthly enable row level security;

-- App users can read their own monthly usage.
drop policy if exists "Users can read own clip usage" on public.clip_usage_monthly;
create policy "Users can read own clip usage"
on public.clip_usage_monthly
for select
to authenticated
using (auth.uid() = user_id);

-- Prevent direct inserts/updates from client; use reserve_clip_exports RPC.
drop policy if exists "No direct insert on clip usage" on public.clip_usage_monthly;
create policy "No direct insert on clip usage"
on public.clip_usage_monthly
for insert
to authenticated
with check (false);

drop policy if exists "No direct update on clip usage" on public.clip_usage_monthly;
create policy "No direct update on clip usage"
on public.clip_usage_monthly
for update
to authenticated
using (false)
with check (false);

create or replace function public.reserve_clip_exports(
  p_plan text,
  p_requested integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_period date := date_trunc('month', now())::date;
  v_limit integer;
  v_used integer;
  v_requested integer := greatest(coalesce(p_requested, 0), 0);
  v_next_used integer;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'message', 'Authentication required'
    );
  end if;

  if v_requested <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'message', 'Requested clip count must be positive'
    );
  end if;

  v_limit := case lower(coalesce(p_plan, 'free'))
    when 'max' then 500
    when 'pro' then 120
    else 10
  end;

  insert into public.clip_usage_monthly (user_id, period_start, clips_used, created_at, updated_at)
  values (v_user_id, v_period, 0, now(), now())
  on conflict (user_id, period_start) do nothing;

  select clips_used
    into v_used
  from public.clip_usage_monthly
  where user_id = v_user_id and period_start = v_period
  for update;

  if (v_used + v_requested) > v_limit then
    return jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'remaining', greatest(v_limit - v_used, 0),
      'message', format('Monthly limit reached: %s/%s clips used', v_used, v_limit)
    );
  end if;

  v_next_used := v_used + v_requested;

  update public.clip_usage_monthly
  set clips_used = v_next_used,
      updated_at = now()
  where user_id = v_user_id and period_start = v_period;

  return jsonb_build_object(
    'allowed', true,
    'used', v_next_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_next_used, 0)
  );
end;
$$;

revoke all on function public.reserve_clip_exports(text, integer) from public;
grant execute on function public.reserve_clip_exports(text, integer) to authenticated;

create or replace function public.release_clip_exports(
  p_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_period date := date_trunc('month', now())::date;
  v_used integer;
  v_count integer := greatest(coalesce(p_count, 0), 0);
  v_refunded integer;
  v_next_used integer;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Authentication required'
    );
  end if;

  if v_count <= 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'Refund count must be positive'
    );
  end if;

  insert into public.clip_usage_monthly (user_id, period_start, clips_used, created_at, updated_at)
  values (v_user_id, v_period, 0, now(), now())
  on conflict (user_id, period_start) do nothing;

  select clips_used
    into v_used
  from public.clip_usage_monthly
  where user_id = v_user_id and period_start = v_period
  for update;

  v_refunded := least(v_count, greatest(v_used, 0));
  v_next_used := greatest(v_used - v_refunded, 0);

  update public.clip_usage_monthly
  set clips_used = v_next_used,
      updated_at = now()
  where user_id = v_user_id and period_start = v_period;

  return jsonb_build_object(
    'ok', true,
    'used', v_next_used,
    'refunded', v_refunded
  );
end;
$$;

revoke all on function public.release_clip_exports(integer) from public;
grant execute on function public.release_clip_exports(integer) to authenticated;

