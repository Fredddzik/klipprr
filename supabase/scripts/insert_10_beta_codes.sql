-- Run this in Supabase SQL Editor (Dashboard → SQL Editor).
-- license_duration_days: NULL = permanent Pro; 30 = 1 month; 7 = 1 week.
-- Your redeem_activation_code Edge Function must set licenses.expires_at from this
-- (NULL when license_duration_days is NULL, else now() + license_duration_days).

-- Example: 10 permanent codes (friends)
insert into public.activation_codes (code, plan, license_duration_days)
values
  ('BETA-KLIP-001', 'pro', null),
  ('BETA-KLIP-002', 'pro', null),
  ('BETA-KLIP-003', 'pro', null),
  ('BETA-KLIP-004', 'pro', null),
  ('BETA-KLIP-005', 'pro', null),
  ('BETA-KLIP-006', 'pro', null),
  ('BETA-KLIP-007', 'pro', null),
  ('BETA-KLIP-008', 'pro', null),
  ('BETA-KLIP-009', 'pro', null),
  ('BETA-KLIP-010', 'pro', null)
on conflict (code) do nothing
returning code, plan, license_duration_days, created_at;

-- Example: 5 one-month codes (beta testers) – run separately if you want these too
-- insert into public.activation_codes (code, plan, license_duration_days)
-- values
--   ('BETA-1M-001', 'pro', 30),
--   ('BETA-1M-002', 'pro', 30),
--   ('BETA-1M-003', 'pro', 30),
--   ('BETA-1M-004', 'pro', 30),
--   ('BETA-1M-005', 'pro', 30)
-- on conflict (code) do nothing
-- returning code, plan, license_duration_days, created_at;
