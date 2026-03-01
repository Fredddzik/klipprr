-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) to create one new beta code.
-- Table schema: code, plan, redeemed_by, redeemed_at, created_at

insert into public.activation_codes (code, plan)
values (
  'BETA-' || upper(substring(md5(random()::text) from 1 for 8)),
  'pro'
)
returning code, plan, created_at;
