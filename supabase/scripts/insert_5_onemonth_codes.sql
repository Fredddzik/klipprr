-- Run in Supabase SQL Editor after the migration that adds license_duration_days.
-- These codes grant Pro for 30 days from redemption (for beta testers).

insert into public.activation_codes (code, plan, license_duration_days)
values
  ('BETA-1M-001', 'pro', 30),
  ('BETA-1M-002', 'pro', 30),
  ('BETA-1M-003', 'pro', 30),
  ('BETA-1M-004', 'pro', 30),
  ('BETA-1M-005', 'pro', 30)
on conflict (code) do nothing
returning code, plan, license_duration_days, created_at;
