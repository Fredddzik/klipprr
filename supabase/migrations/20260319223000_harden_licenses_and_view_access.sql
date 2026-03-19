-- Harden license and reporting surfaces.
-- Applied via MCP on 2026-03-19 as well; keep in repo for reproducibility.

begin;

-- Prevent users from self-creating license rows (e.g. forcing plan='pro').
drop policy if exists "Users can insert own license" on public.licenses;
drop policy if exists "Users can insert their own license" on public.licenses;

-- Keep self-read access for client UX.
do $$
begin
  if not exists (
    select 1
    from pg_policies
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

-- Remove direct client access to admin/reporting view.
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
