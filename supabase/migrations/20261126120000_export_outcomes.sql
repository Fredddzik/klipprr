-- Why an export gave clips back: the user cancelled it, or it failed (and with which of the
-- app's internal error codes). Until now a refunded reservation looked the same either way,
-- so a failure could not be told apart from someone changing their mind.
--
-- Privacy: only a fixed outcome and an internal error code (letters, digits, underscores,
-- enforced below), never a link, platform, file name or free text. Covered by Privacy
-- Policy §3.2 ("whether it finished, was cancelled or failed, with the app's internal error code"),
-- on legitimate interest in fixing failures. It travels with the refund call the app
-- already makes, so it needs no analytics consent and never goes to PostHog.
--
-- Compatible with released apps: the two new parameters default to null, so 0.1.38+ calling
-- release_export_reservation(p_reservation_id, p_count) behaves exactly as before.

alter table public.export_reservations
  add column if not exists outcome    text,
  add column if not exists error_code text,
  add column if not exists ended_at   timestamptz;

alter table public.export_reservations
  drop constraint if exists export_reservations_outcome_check,
  add constraint export_reservations_outcome_check
    check (outcome is null or outcome in ('cancelled', 'failed', 'mixed')),
  drop constraint if exists export_reservations_error_code_check,
  add constraint export_reservations_error_code_check
    check (error_code is null or error_code ~ '^[a-z0-9_]{1,40}$');

-- Replaced, not overloaded: two versions with different argument lists would make a
-- two-argument call ambiguous.
drop function if exists public.release_export_reservation(uuid, integer);

-- Gives back up to p_count clips of one reservation and records why they went unused.
-- outcome: 'cancelled' (every unused clip was cancelled), 'failed' (none was), 'mixed'.
-- The outcome is recorded even when no refund is due (expired reservation, cap reached),
-- and only once per reservation.
create or replace function public.release_export_reservation(
  p_reservation_id uuid,
  p_count integer,
  p_outcome text default null,
  p_error_code text default null
)
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
  v_outcome text := case when p_outcome in ('cancelled', 'failed', 'mixed') then p_outcome end;
  v_error text := case
    when p_error_code is null then null
    when p_error_code ~ '^[a-z0-9_]{1,40}$' then p_error_code
    else 'other'
  end;
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

  if v_outcome is not null and v_res.outcome is null then
    update public.export_reservations
    set outcome = v_outcome,
        error_code = case when v_outcome = 'cancelled' then null else v_error end,
        ended_at = now()
    where id = v_res.id;
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

revoke execute on function public.release_export_reservation(uuid, integer, text, text) from public, anon;
grant execute on function public.release_export_reservation(uuid, integer, text, text) to authenticated;

notify pgrst, 'reload schema';
