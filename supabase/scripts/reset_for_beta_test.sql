-- Reset so you can test the full UX + beta code redeem flow again.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor).
--
-- 1. Replace 'your@email.com' with your actual email (the one with Pro that redeemed the code).
-- 2. Replace 'BETA-CLIP-001' with the activation code you want to un-redeem (so you can redeem it again).

-- Step A: Remove your Pro license (app will show Free after you Sync or restart)
DELETE FROM public.licenses
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your@email.com');

-- Step B: Un-redeem the code so it can be used again
UPDATE public.activation_codes
SET redeemed_by = NULL, redeemed_at = NULL
WHERE code = 'BETA-CLIP-001';

-- After running:
-- - In the app: Logout (so caps clear), then Login again via browser → you'll be Free.
-- - Open a locked feature → Upgrade modal → "Enter Beta Code" → paste the code → Redeem.
-- - You should get Pro back.
