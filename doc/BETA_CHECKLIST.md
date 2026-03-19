# Beta checklist & exit criteria

Use this before inviting beta users and before calling the product “production ready.”

## Before first beta invite (smoke, ~30 min)

Do these on **production** (or staging that mirrors prod env vars):

- [ ] **Desktop auth**: Log in from browser → deep link opens app → session persists across app restart.
- [ ] **Stripe**: Start checkout → complete or cancel → land on **`/upgrade`** on your **canonical** domain (check `NEXT_PUBLIC_APP_URL` in Vercel).
- [ ] **Activation code**: Valid code redeems → license row updates → app shows Pro (or equivalent).
- [ ] **Used / invalid code**: Returns **400** with a safe message (no stack traces to client).
- [ ] **Release**: Latest tagged build (e.g. `v0.1.x`) installs and “Check for updates” works if you ship updater JSON.

## Beta period — monitor

- [ ] **Supabase**: Auth anomalies, Edge Function errors, unusual `licenses` / `activation_codes` patterns.
- [ ] **Stripe**: Webhook delivery failures in Stripe dashboard; reconcile subscriptions vs `licenses` table occasionally.
- [ ] **Support channel**: One place for beta feedback + security reports (email or form).

## Exit criteria — “beta → wider launch”

These are **recommended** before a broad marketing push or paid scale-up. Order is flexible.

### 1. License integrity (business / anti-abuse)

- [ ] **Ed25519 enforcement** in release builds: `KLIPPRR_LICENSE_ED25519_PUB_B64` set in CI (see `doc/LICENSE_SIGNING.md`).
- [ ] **`desktop_license_sig`** populated for paid/active rows (signer job or migration path documented).
- [ ] **Reject** unsigned or wrong-signature tokens when pubkey is configured (verify behavior in a test build).

### 2. Session & secrets

- [ ] **Decision** on Supabase session: keychain-only vs file mirror — documented for users (e.g. “tokens on disk” risk on shared machines).
- [ ] **Rotate** any credential that may have appeared in old logs or shared crash dumps.
- [ ] **Confirm** `.env*.local` and Vercel envs are never committed; service role only server-side.

### 3. Database & API surface

- [ ] **RLS**: No `INSERT`/`UPDATE` on `licenses` from authenticated client except via controlled paths (webhook / Edge Function / service role).
- [ ] **Cleanup**: Remove duplicate overlapping policies (e.g. two `SELECT` policies on `licenses` with the same intent).
- [ ] **Abuse**: Rate limit or bot-slow for public writes (`waitlist`, etc.) if traffic spikes.

### 4. Desktop app hardening

- [ ] **Local HTTP**: Re-review allowed origins and SSRF rules after any new endpoints.
- [ ] **Tauri invoke surface**: Only commands that must be web-accessible are exposed.
- [ ] **CSP / XSS**: Revisit `tauri.conf.json` CSP settings before loading any untrusted HTML or rich user content in the webview.

### 5. Operations

- [ ] **Backups** + tested restore for Supabase (or documented RPO/RTO).
- [ ] **Dependency / CVE** pass on release branch (`cargo audit`, `npm audit` where applicable).
- [ ] **Incident basics**: Who gets paged, how to rotate Stripe/Supabase keys, how to disable checkout in an emergency.

---

## Quick reference — env vars that must be correct in prod

| Where | Variable | Why |
|-------|----------|-----|
| Vercel (site) | `NEXT_PUBLIC_APP_URL` | Stripe success/cancel URLs (must be canonical site). |
| Vercel (site) | Stripe + Supabase server keys | Checkout + webhook + DB updates. |
| CI (Tauri build) | `NEXT_PUBLIC_SUPABASE_*` | Bundled desktop config (see `release.yml`). |
| CI (optional) | `KLIPPRR_LICENSE_ED25519_PUB_B64` | Strict desktop license verification. |

---

*Last updated: 2026-03-19*
