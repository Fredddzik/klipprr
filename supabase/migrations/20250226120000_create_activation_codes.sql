-- Beta/activation codes for redeem_activation_code Edge Function.
-- Schema matches existing table: code, plan, redeemed_by, redeemed_at, created_at.
-- When redeemed, redeemed_at and redeemed_by are set and a licenses row is created/updated.

create table if not exists public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plan text not null default 'pro' check (plan in ('free', 'pro')),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists activation_codes_code_key on public.activation_codes (code);
create index if not exists activation_codes_unredeemed on public.activation_codes (code)
  where redeemed_at is null;

comment on table public.activation_codes is 'Codes redeemable via redeem_activation_code Edge Function.';

alter table public.activation_codes enable row level security;
