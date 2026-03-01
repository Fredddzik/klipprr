-- Licenses table: one row per user; plan (free|pro), active, expires_at.
-- Stripe columns for future webhook-driven Pro subscriptions.
-- Compatible with existing app/website queries: user_id, plan, active, expires_at.

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  active boolean not null default true,
  expires_at timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active license per user (optional: partial unique so multiple inactive rows allowed)
create unique index if not exists licenses_user_id_active_key
  on public.licenses (user_id)
  where active = true;

comment on table public.licenses is 'User license (free/pro). Pro set via Supabase or Stripe webhook.';
comment on column public.licenses.stripe_subscription_id is 'Set by Stripe webhook when subscription is created.';
comment on column public.licenses.stripe_customer_id is 'Stripe customer id for this user.';
comment on column public.licenses.stripe_price_id is 'Stripe price id for the Pro plan.';

-- RLS: users can read/update their own row; service role bypasses for webhooks
alter table public.licenses enable row level security;

create policy "Users can read own license"
  on public.licenses for select
  using (auth.uid() = user_id);

create policy "Users can update own license"
  on public.licenses for update
  using (auth.uid() = user_id);

-- Insert/delete typically done by backend/webhook (service role); allow insert for same user if needed
create policy "Users can insert own license"
  on public.licenses for insert
  with check (auth.uid() = user_id);

-- Keep updated_at in sync
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists licenses_updated_at on public.licenses;
create trigger licenses_updated_at
  before update on public.licenses
  for each row execute function public.set_updated_at();
