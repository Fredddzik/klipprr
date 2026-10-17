-- Leftovers the database linter and the 2026-10 audit found.
--
-- 1. pg_net was installed into `public`, which exposes its objects next to ours. It
--    cannot be moved with ALTER EXTENSION ... SET SCHEMA, so it is recreated in
--    `extensions`. Its functions live in the `net` schema either way, so
--    handle_new_signup_notification() (net.http_post) needs no change. Requests still
--    queued at that moment are dropped; they are signup notification emails only.
drop extension if exists pg_net;
create extension pg_net schema extensions;

-- 2. licenses had two identical unique constraints on user_id.
alter table public.licenses drop constraint if exists licenses_user_unique;

-- 3. activation_codes allowed only free and pro, though redeem_activation_code maps max
--    correctly: a Max code could not be created.
alter table public.activation_codes drop constraint if exists activation_codes_plan_check;
alter table public.activation_codes
  add constraint activation_codes_plan_check check (plan = any (array['free', 'pro', 'max']));
