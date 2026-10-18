-- Security hardening flagged by the Supabase database linter.
--
-- 1. `handle_new_user` and `handle_new_signup_notification` are trigger functions, but
--    because they live in the `public` schema PostgREST exposes them at
--    /rest/v1/rpc/<name>, callable by anon and authenticated. They are SECURITY DEFINER,
--    so a caller would run them as the owner. Triggers reach them through the trigger
--    mechanism, not through EXECUTE granted to API roles, so revoking is safe.
--
-- 2. `email_sequence_log` has RLS on with no policy, which already denies everything to
--    anon/authenticated. Add an explicit service-role policy so the intent is written
--    down instead of implied.

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.handle_new_signup_notification() from anon, authenticated, public;

-- The clip quota functions stay callable: the desktop app invokes them as the signed-in
-- user, and they resolve the plan server-side from `licenses` (the p_plan argument is
-- deliberately ignored inside the function).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_sequence_log'
      and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on public.email_sequence_log
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
