-- Baseline: the public schema of the live project (fmegrgbpeobamzivplyi) as it stood on
-- 2026-10-17, read from the database catalogue. The early tables were created by hand in
-- the dashboard and never had migrations, so this file, not the history in migrations/,
-- is what rebuilds the database. Migrations newer than 20261017000000 apply on top.
--
-- Extensions in use: pgcrypto, uuid-ossp, pg_stat_statements (schema extensions),
-- supabase_vault (vault), pg_net (see migrations/20261017130000_pg_net_extensions_schema.sql).
-- Vault secret required: notify_webhook_secret (shared with the notify_new_signup edge
-- function's NOTIFY_WEBHOOK_SECRET).

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid not null,
  email text not null,
  created_at timestamp with time zone default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade
);

create table public.licenses (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  plan text not null,
  issued_at timestamp with time zone default now(),
  expires_at timestamp with time zone,
  active boolean default true not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status text,
  -- Ed25519-signed token the desktop app verifies offline; written by klipprr-web's
  -- Stripe webhook, which holds the private key.
  desktop_license_payload text,
  desktop_license_sig text,
  constraint licenses_pkey primary key (id),
  constraint licenses_plan_check check (plan = any (array['free', 'pro', 'max'])),
  constraint licenses_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint licenses_user_id_unique unique (user_id)
);

create table public.activation_codes (
  code text not null,
  plan text not null,
  redeemed_by uuid,
  redeemed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  license_duration_days integer,
  constraint activation_codes_pkey primary key (code),
  constraint activation_codes_plan_check check (plan = any (array['free', 'pro'])),
  constraint activation_codes_redeemed_by_fkey foreign key (redeemed_by) references auth.users(id)
);

create table public.clip_usage_monthly (
  user_id uuid not null,
  period_start date not null,
  clips_used integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint clip_usage_monthly_pkey primary key (user_id, period_start),
  constraint clip_usage_monthly_clips_used_check check (clips_used >= 0),
  constraint clip_usage_monthly_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
create index clip_usage_monthly_period_start_idx on public.clip_usage_monthly using btree (period_start);

create table public.email_sequence_log (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  email_key text not null,
  sent_at timestamp with time zone default now() not null,
  constraint email_sequence_log_pkey primary key (id),
  constraint email_sequence_log_user_id_email_key_key unique (user_id, email_key),
  constraint email_sequence_log_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
comment on table public.email_sequence_log is 'Tracks which onboarding emails have been sent to each user to prevent duplicates.';

create table public.email_unsubscribes (
  user_id uuid not null,
  unsubscribed_at timestamp with time zone default now() not null,
  constraint email_unsubscribes_pkey primary key (user_id),
  constraint email_unsubscribes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table public.waitlist (
  id uuid default gen_random_uuid() not null,
  email text not null,
  platform text not null,
  source text default 'website',
  note text,
  created_at timestamp with time zone default now() not null,
  user_id uuid,
  constraint waitlist_pkey primary key (id)
);

-- Admin view; not exposed to clients.
create view public.v_user_licenses with (security_invoker = true) as
  select p.id as user_id, p.email, p.created_at as profile_created_at,
         l.id as license_id, l.plan, l.active, l.issued_at, l.expires_at
  from public.profiles p
  left join public.licenses l on l.user_id = p.id;
revoke all on table public.v_user_licenses from anon, authenticated;

-- ---------------------------------------------------------------- row level security
-- Clients may only read their own rows. Every write goes through the service role
-- (klipprr-web) or a security-definer function below.

alter table public.profiles enable row level security;
alter table public.licenses enable row level security;
alter table public.activation_codes enable row level security;
alter table public.clip_usage_monthly enable row level security;
alter table public.email_sequence_log enable row level security;
alter table public.email_unsubscribes enable row level security;
alter table public.waitlist enable row level security;

create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can read own license" on public.licenses
  for select using (auth.uid() = user_id);
create policy "No direct read access" on public.activation_codes
  for select using (false);
create policy "Users can read own clip usage" on public.clip_usage_monthly
  for select to authenticated using (auth.uid() = user_id);
create policy "No direct insert on clip usage" on public.clip_usage_monthly
  for insert to authenticated with check (false);
create policy "No direct update on clip usage" on public.clip_usage_monthly
  for update to authenticated using (false) with check (false);
create policy "service_role_all" on public.email_sequence_log
  for all to service_role using (true) with check (true);
create policy "service_role_all" on public.email_unsubscribes
  for all to service_role using (true) with check (true);
create policy "Anyone can join waitlist" on public.waitlist
  for insert with check (true);

-- ---------------------------------------------------------------- Data API grants
-- From 2026-10-30 Supabase no longer grants API access to new tables in `public`
-- automatically, so a database rebuilt from this file needs them spelled out. They match
-- the policies above: RLS still decides which rows; a grant only opens the table to a role.
-- (The live tables, created earlier, carry Supabase's old blanket grants; RLS makes the
-- extra ones inert.)

grant select on public.profiles to authenticated;
grant select on public.licenses to authenticated;
grant select on public.clip_usage_monthly to authenticated;
grant insert on public.waitlist to anon, authenticated;

grant select, insert, update, delete on
  public.profiles, public.licenses, public.activation_codes, public.clip_usage_monthly,
  public.email_sequence_log, public.email_unsubscribes, public.waitlist
  to service_role;
grant select on public.v_user_licenses to service_role;

-- ---------------------------------------------------------------- signup triggers

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$function$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Emails the founder about each signup through the notify_new_signup edge function.
create or replace function public.handle_new_signup_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'notify_webhook_secret'
  limit 1;

  if v_secret is null or v_secret = '' then
    raise warning 'notify_new_signup skipped: vault secret notify_webhook_secret is missing';
    return NEW;
  end if;

  perform net.http_post(
    url := 'https://fmegrgbpeobamzivplyi.supabase.co/functions/v1/notify_new_signup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object(
      'id',         NEW.id,
      'email',      NEW.email,
      'created_at', NEW.created_at
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
exception when others then
  -- A notification must never be able to fail a signup.
  raise warning 'notify_new_signup failed: %', sqlerrm;
  return NEW;
end;
$function$;

create trigger on_new_signup_notify
  after insert on public.profiles
  for each row execute function public.handle_new_signup_notification();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_signup_notification() from public, anon, authenticated;

-- ---------------------------------------------------------------- clip quota
-- reserve_clip_exports and release_clip_exports as of this baseline. Both are replaced
-- by migrations/20261017120000_export_reservations.sql.

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
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'message', 'Authentication required');
  end if;
  if v_requested <= 0 then
    return jsonb_build_object('allowed', false, 'message', 'Requested clip count must be positive');
  end if;

  -- p_plan from the caller is ignored; the plan comes from licenses.
  select plan into v_plan
  from public.licenses
  where user_id = v_user_id and active = true and (expires_at is null or expires_at > now())
  limit 1;
  v_plan := lower(coalesce(v_plan, 'free'));
  v_limit := case v_plan when 'max' then 500 when 'pro' then 120 else 10 end;

  insert into public.clip_usage_monthly (user_id, period_start, clips_used, created_at, updated_at)
  values (v_user_id, v_period, 0, now(), now())
  on conflict (user_id, period_start) do nothing;

  select clips_used into v_used
  from public.clip_usage_monthly
  where user_id = v_user_id and period_start = v_period
  for update;

  if (v_used + v_requested) > v_limit then
    return jsonb_build_object(
      'allowed', false, 'used', v_used, 'limit', v_limit,
      'remaining', greatest(v_limit - v_used, 0),
      'message', format('Monthly limit reached: %s/%s clips used', v_used, v_limit)
    );
  end if;

  v_next_used := v_used + v_requested;
  update public.clip_usage_monthly
  set clips_used = v_next_used, updated_at = now()
  where user_id = v_user_id and period_start = v_period;

  return jsonb_build_object(
    'allowed', true, 'used', v_next_used, 'limit', v_limit,
    'remaining', greatest(v_limit - v_next_used, 0)
  );
end;
$function$;

create or replace function public.release_clip_exports(p_count integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_period date := date_trunc('month', now())::date;
  v_used integer;
  v_count integer := greatest(coalesce(p_count, 0), 0);
  v_refunded integer;
  v_next_used integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'Authentication required');
  end if;
  if v_count <= 0 then
    return jsonb_build_object('ok', false, 'message', 'Refund count must be positive');
  end if;

  insert into public.clip_usage_monthly (user_id, period_start, clips_used, created_at, updated_at)
  values (v_user_id, v_period, 0, now(), now())
  on conflict (user_id, period_start) do nothing;

  select clips_used into v_used
  from public.clip_usage_monthly
  where user_id = v_user_id and period_start = v_period
  for update;

  v_refunded := least(v_count, greatest(v_used, 0));
  v_next_used := greatest(v_used - v_refunded, 0);
  update public.clip_usage_monthly
  set clips_used = v_next_used, updated_at = now()
  where user_id = v_user_id and period_start = v_period;

  return jsonb_build_object('ok', true, 'used', v_next_used, 'refunded', v_refunded);
end;
$function$;
