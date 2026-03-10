-- One-off: ensure a user has an active Pro license (e.g. after redeem wrote to wrong user_id or insert failed).
-- Replace the UUID with the auth.users.id for the user (see Session log: user_id=...).

-- 1) See current state
-- SELECT id, email FROM auth.users WHERE email = 'freddy.hypky@gmail.com';
-- SELECT * FROM public.licenses WHERE user_id = '723268b9-cc68-4abb-9216-cbc9ef01e795';

-- 2) Deactivate any existing active row for this user (so we can insert one if needed)
UPDATE public.licenses
SET active = false, updated_at = now()
WHERE user_id = '723268b9-cc68-4abb-9216-cbc9ef01e795' AND active = true;

-- 3) Insert active Pro row (no active row for this user after step 2, so no unique violation)
INSERT INTO public.licenses (user_id, plan, active, expires_at)
VALUES (
  '723268b9-cc68-4abb-9216-cbc9ef01e795',
  'pro',
  true,
  NULL
);
