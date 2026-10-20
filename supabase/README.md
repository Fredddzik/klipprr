# Supabase (project `fmegrgbpeobamzivplyi`)

The database, its functions and the edge functions, versioned with the app since 2026-10-17.
Before that they lived only in the dashboard and in `~/dev/klipprr-local` (not a git
repository), and the repo copy no longer matched the live database.

| Path | What it is |
|---|---|
| `schema.sql` | Baseline: the complete public schema as it stood on 2026-10-17 |
| `migrations/` | Changes after the baseline, applied in filename order |
| `functions/` | Edge functions, as deployed |
| `history/` | The live project's recorded migrations before the baseline. Reference only |

## Rules

- **Every change is a file in `migrations/` first**, then applied (Supabase MCP
  `apply_migration` with the same name, or the dashboard SQL editor). Never change the live
  database without the file.
- **Test a migration before applying it**: run it inside `begin; … rollback;` with a
  throwaway user (insert into `auth.users`, `set local role authenticated`, set
  `request.jwt.claims`), and end the test block with `raise exception` carrying the results so
  nothing can commit. The 20261017120000 migration was tested that way.
- **Keep old app versions working.** Released desktop apps call `reserve_clip_exports` and
  `release_clip_exports` with fixed signatures; change them compatibly or the installed base
  breaks until it updates.
- **Every new table gets its grants in the same migration** (Supabase stopped granting new
  `public` tables automatically on 2026-10-30): `select` to `authenticated` only where a
  policy lets users read their rows, the same for any write a policy allows, and
  `select, insert, update, delete` to `service_role`. Without them the API answers
  "permission denied" even when RLS would allow the request.
- **Secrets never go in a migration.** Use Vault (`vault.decrypted_secrets`) or the edge
  function's environment.

## Where things are enforced

- **Plan:** `licenses`, written only by klipprr-web's Stripe webhook and the
  `redeem_activation_code` edge function (service role). Both sign the desktop licence with
  `KLIPPRR_LICENSE_ED25519_PRIV_B64`, so that key exists in two places: Vercel and this
  project's edge function secrets.
- **Monthly clips:** `reserve_clip_exports` / `release_export_reservation`, called by the
  desktop agent (`clipagent/src-tauri/src/quota.rs`), never by the UI.

## Applied status

| Migration | Live? |
|---|---|
| 20261017120000_export_reservations | applied 2026-10-18 |
| 20261017130000_cleanup_pg_net_and_duplicate_constraint | applied 2026-10-18 |
