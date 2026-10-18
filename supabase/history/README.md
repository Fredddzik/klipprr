# Migration history (reference only)

The migrations recorded in the live project's `supabase_migrations.schema_migrations`, copied
on 2026-10-17. They are **incomplete**: `profiles`, `licenses`, `activation_codes`,
`clip_usage_monthly`, `waitlist` and the first versions of the quota functions were created in
the dashboard and never recorded. Do not replay these; `../schema.sql` is the baseline.

On 2026-10-18 the why-comments from `klipprr-web/supabase/migrations/` were carried into
four of these files (`20260430171153`, `20260919132846`, `20260919152212`, `20260923092006`),
and the klipprr-web copies were deleted — that directory had been a second place claiming
this database. So those four are no longer verbatim records: the SQL is unchanged, the
comments are additions. `20260919152212` also regained its full function body, which had
survived only in klipprr-web; it is marked never-apply in the file, because that body
called a schema this project does not have.

One historical migration hard-coded the signup webhook secret. It is redacted here; the
function has read the secret from Vault since 20260919152212, and the Vault value differs
from the old one (checked 2026-10-17), so the leaked value is dead.

The older files from `~/dev/klipprr-local/supabase/migrations` (2025 and March 2026) predate
this history and are superseded by the baseline as well.
