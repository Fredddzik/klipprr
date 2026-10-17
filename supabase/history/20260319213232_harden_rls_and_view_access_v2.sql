begin;

-- Critical: prevent self-upgrade / self-billing edits via client INSERT on licenses.
drop policy if exists "Users can insert own license" on public.licenses;
drop policy if exists "Users can insert their own license" on public.licenses;

-- Keep self-read from client if missing.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'licenses'
      and policyname = 'Users can read own license'
      and cmd = 'SELECT'
  ) then
    create policy "Users can read own license"
      on public.licenses
      for select
      using ((select auth.uid()) = user_id);
  end if;
end $$;

-- Harden view exposure: avoid SECURITY DEFINER/RLS-bypass-style risk and remove client grants.
do $$
begin
  begin
    execute 'alter view public.v_user_licenses set (security_invoker = true)';
  exception when others then
    null;
  end;
end $$;

revoke all on table public.v_user_licenses from anon;
revoke all on table public.v_user_licenses from authenticated;

commit;
