-- Refunds were unbounded: release_clip_exports(p_count) let any signed-in user subtract
-- any number from their own monthly usage, so the clip limit could be reset with one
-- REST call. Every reservation is now a row, and a refund can only give back clips of a
-- reservation that has not been refunded yet, within a day, and within a monthly cap.
--
-- The app cannot prove to the server that an export failed, so refunds still rest on the
-- client's word. The cap bounds what a dishonest client can gain to a quarter of the plan
-- (at least 5 clips) a month.

create table if not exists public.export_reservations (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  period_start date        not null,
  clips        integer     not null check (clips > 0),
  refunded     integer     not null default 0,
  created_at   timestamptz not null default now(),
  constraint export_reservations_refunded_range check (refunded >= 0 and refunded <= clips)
);

create index if not exists export_reservations_user_period_idx
  on public.export_reservations (user_id, period_start);

alter table public.export_reservations enable row level security;

drop policy if exists "Users can read own reservations" on public.export_reservations;
create policy "Users can read own reservations"
  on public.export_reservations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.export_reservations from anon, authenticated;
-- Explicit, because Supabase stops granting new tables automatically on 2026-10-30.
grant select on public.export_reservations to authenticated;
grant select, insert, update, delete on public.export_reservations to service_role;

-- Shared by both refund functions: the plan's limit and how much may still be refunded
-- this month.
create or replace function public.clip_refund_allowance(p_user_id uuid, p_period date)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_plan text;
  v_limit integer;
  v_refunded integer;
begin
  select lower(plan) into v_plan
  from public.licenses
  where user_id = p_user_id
    and active = true
    and (expires_at is null or expires_at > now())
  limit 1;

  v_limit := case coalesce(v_plan, 'free')
    when 'max' then 500
    when 'pro' then 120
    else 10
  end;

  select coalesce(sum(refunded), 0) into v_refunded
  from public.export_reservations
  where user_id = p_user_id and period_start = p_period;

  return greatest(greatest(5, v_limit / 4) - v_refunded, 0);
end;
$function$;

revoke execute on function public.clip_refund_allowance(uuid, date) from public, anon, authenticated;

-- Same contract as before (callers in 0.1.37 and earlier keep working), plus the
-- reservation id the refund needs.
create or replace function public.reserve_clip_exports(p_plan text, p_requested integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_period date := date_trunc('month', now())::date;
  v_plan text;
  v_limit integer;
  v_used integer;
  v_requested integer := greatest(coalesce(p_requested, 0), 0);
  v_next_used integer;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'message', 'Authentication required');
  end if;

  if v_requested <= 0 then
    return jsonb_build_object('allowed', false, 'message', 'Requested clip count must be positive');
  end if;

  -- The plan comes from licenses; p_plan from the caller is ignored, it cannot be trusted.
  select plan into v_plan
  from public.licenses
  where user_id = v_user_id
    and active = true
    and (expires_at is null or expires_at > now())
  limit 1;

  v_plan := lower(coalesce(v_plan, 'free'));
  v_limit := case v_plan
    when 'max' then 500
    when 'pro' then 120
    else 10
  end;

  insert into public.clip_usage_monthly (user_id, period_start, clips_used, created_at, updated_at)
  values (v_user_id, v_period, 0, now(), now())
  on conflict (user_id, period_start) do nothing;

  select clips_used into v_used
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
  set clips_used = v_next_used, updated_at = now()
  where user_id = v_user_id and period_start = v_period;

  insert into public.export_reservations (user_id, period_start, clips)
  values (v_user_id, v_period, v_requested)
  returning id into v_reservation_id;

  return jsonb_build_object(
    'allowed', true,
    'used', v_next_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_next_used, 0),
    'reservation_id', v_reservation_id
  );
end;
$function$;

-- Gives back up to p_count clips of one reservation. Called by the desktop agent for
-- clips that failed or were cancelled.
create or replace function public.release_export_reservation(p_reservation_id uuid, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_period date := date_trunc('month', now())::date;
  v_res public.export_reservations%rowtype;
  v_refund integer;
  v_used integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'Authentication required');
  end if;

  select * into v_res
  from public.export_reservations
  where id = p_reservation_id and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Unknown reservation');
  end if;

  -- A refund only makes sense while the reservation's month is still the current one.
  if v_res.period_start <> v_period or v_res.created_at < now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'message', 'Reservation expired', 'refunded', 0);
  end if;

  v_refund := least(
    greatest(coalesce(p_count, 0), 0),
    v_res.clips - v_res.refunded,
    public.clip_refund_allowance(v_user_id, v_period)
  );

  if v_refund <= 0 then
    return jsonb_build_object('ok', true, 'refunded', 0);
  end if;

  update public.export_reservations
  set refunded = refunded + v_refund
  where id = v_res.id;

  update public.clip_usage_monthly
  set clips_used = greatest(clips_used - v_refund, 0), updated_at = now()
  where user_id = v_user_id and period_start = v_period
  returning clips_used into v_used;

  return jsonb_build_object('ok', true, 'refunded', v_refund, 'used', coalesce(v_used, 0));
end;
$function$;

-- Kept for 0.1.37 and earlier, which refund by count. It now only gives back clips of the
-- caller's own reservations from the last two hours, newest first, under the same cap.
create or replace function public.release_clip_exports(p_count integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_period date := date_trunc('month', now())::date;
  v_left integer := greatest(coalesce(p_count, 0), 0);
  v_total integer := 0;
  v_take integer;
  v_used integer;
  r record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'Authentication required');
  end if;

  if v_left <= 0 then
    return jsonb_build_object('ok', false, 'message', 'Refund count must be positive');
  end if;

  v_left := least(v_left, public.clip_refund_allowance(v_user_id, v_period));

  for r in
    select id, clips - refunded as open
    from public.export_reservations
    where user_id = v_user_id
      and period_start = v_period
      and created_at > now() - interval '2 hours'
      and refunded < clips
    order by created_at desc
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.open);
    update public.export_reservations set refunded = refunded + v_take where id = r.id;
    v_total := v_total + v_take;
    v_left := v_left - v_take;
  end loop;

  if v_total > 0 then
    update public.clip_usage_monthly
    set clips_used = greatest(clips_used - v_total, 0), updated_at = now()
    where user_id = v_user_id and period_start = v_period;
  end if;

  select clips_used into v_used
  from public.clip_usage_monthly
  where user_id = v_user_id and period_start = v_period;

  return jsonb_build_object('ok', true, 'used', coalesce(v_used, 0), 'refunded', v_total);
end;
$function$;

-- Signed-in users only; nothing here is for anonymous callers.
revoke execute on function public.reserve_clip_exports(text, integer) from public, anon;
revoke execute on function public.release_clip_exports(integer) from public, anon;
revoke execute on function public.release_export_reservation(uuid, integer) from public, anon;
grant execute on function public.reserve_clip_exports(text, integer) to authenticated;
grant execute on function public.release_clip_exports(integer) to authenticated;
grant execute on function public.release_export_reservation(uuid, integer) to authenticated;
