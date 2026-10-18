-- Email unsubscribe table for GDPR/CAN-SPAM compliance. Users who click the unsubscribe
-- link in any marketing email are inserted here, and the email sequence cron skips any
-- user_id present in this table.
create table if not exists public.email_unsubscribes (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  unsubscribed_at timestamptz not null default now()
);

-- Service role can read/write; anon cannot.
alter table public.email_unsubscribes enable row level security;

create policy "service_role_all" on public.email_unsubscribes
  for all
  to service_role
  using (true)
  with check (true);
