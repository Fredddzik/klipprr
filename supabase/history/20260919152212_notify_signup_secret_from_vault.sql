-- Read the signup-notification secret from Supabase Vault instead of hard-coding it in the
-- function body. Rotating it is then a Vault update plus the edge function's
-- NOTIFY_WEBHOOK_SECRET — no SQL — and the secret is no longer readable by anyone who can
-- read function definitions. This is the migration that retired the hard-coded literal in
-- 20260504123345 (redacted; see README.md), so the body below holds no secret of its own.
--
-- NEVER APPLY THIS FILE. It is kept for the record only. The body still called
-- supabase_functions.http_request(), a schema created by Supabase's Database Webhooks
-- feature that this project does not have, so it raised inside the exception handler on
-- every signup and notified nobody for the four days until 20260923092006 replaced it with
-- pg_net. Applying it would re-break signup notifications. `../schema.sql` is the baseline
-- and 20260923092006 is the live shape.
--
-- Preserved here on 2026-10-18: this was the only surviving copy of the body, and it was
-- the last thing left in klipprr-web/supabase/migrations/ that this directory lacked.
create or replace function public.handle_new_signup_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'notify_webhook_secret'
  limit 1;

  if v_secret is null or v_secret = '' then
    -- Never block a signup over a notification. Surface it in the logs instead.
    raise warning 'notify_new_signup skipped: vault secret notify_webhook_secret is missing';
    return NEW;
  end if;

  perform supabase_functions.http_request(
    'https://fmegrgbpeobamzivplyi.supabase.co/functions/v1/notify_new_signup',
    'POST',
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    jsonb_build_object(
      'id',         NEW.id,
      'email',      NEW.email,
      'created_at', NEW.created_at
    ),
    5000
  );
  return NEW;
exception when others then
  raise warning 'notify_new_signup failed: %', sqlerrm;
  return NEW;
end;
$function$;

revoke execute on function public.handle_new_signup_notification() from anon, authenticated, public;
