-- Fix 1a: Remove the hardcoded past-date default on expires_at
ALTER TABLE public.licenses ALTER COLUMN expires_at SET DEFAULT NULL;

-- Fix 1b: Drop the duplicate RLS SELECT policy (keep the grammatically cleaner one)
DROP POLICY IF EXISTS "Users can read their own license" ON public.licenses;
