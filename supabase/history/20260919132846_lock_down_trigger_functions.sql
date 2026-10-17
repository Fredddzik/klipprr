revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.handle_new_signup_notification() from anon, authenticated, public;

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
