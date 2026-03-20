# Desktop license signing (Ed25519)

The desktop app stores a local `license.json` with:

- **`payload`**: URL-safe base64 (no line breaks) of the JSON for `LicenseClaims` (see `clipagent/src-tauri/src/license.rs`).
- **`signature`**:
  - **Legacy:** literal `server-trusted` (accepted only when no build-time public key is set).
  - **Strict:** standard base64 of the **64-byte Ed25519 signature** over the **exact UTF-8 bytes of `payload`** (the base64 string itself, not the decoded JSON).

## Enable strict verification (release builds)

Set this **at compile time** (environment variable visible to `rustc`):

```bash
export KLIPPRR_LICENSE_ED25519_PUB_B64="$(openssl base64 -A -in license_ed25519.pub)"
```

`license_ed25519.pub` must be the **raw 32-byte** Ed25519 public key file.

When `KLIPPRR_LICENSE_ED25519_PUB_B64` is non-empty:

- `server-trusted` is **rejected**.
- The app **requires** a valid Ed25519 signature in `license.signature`.

When it is **unset/empty** (default today):

- Only `server-trusted` is accepted (current behavior).

## Supabase: optional column

Add nullable text columns on `licenses` (names must match JSON from PostgREST):

```sql
alter table public.licenses
  add column if not exists desktop_license_payload text;

alter table public.licenses
  add column if not exists desktop_license_sig text;
```

Populate `desktop_license_payload` with URL-safe base64 of the UTF-8 JSON claims.

Populate `desktop_license_sig` with **standard base64** of the 64-byte signature (same encoding the app expects in `license.signature`).

The sync query uses the user’s JWT; RLS must allow the row to be read. The app passes `desktop_license_payload` and `desktop_license_sig` from the API response into the local license token.

## Signing (must match Rust `serde_json` for claims)

The message signed is always:

```text
message = payload_string_utf8
```

where `payload_string_utf8` is exactly what the app would put in `LicenseToken.payload` (URL-safe base64 of `serde_json::to_string(&LicenseClaims)`).

**Practical approach**

1. In a dev build, log or print the `payload` string the app generates for a user (or reconstruct claims in Rust and print `URL_SAFE.encode(serde_json::to_string(&claims).unwrap().as_bytes())`).
2. Sign those **exact** bytes with your Ed25519 **private** key (keep private key only on the server / CI secret).
3. Store standard base64(signature) in `desktop_license_sig`.

**Rust example (server-side or one-off tool)**

```rust
use base64::{engine::general_purpose::URL_SAFE, Engine};
use ed25519_dalek::{Signer, SigningKey};
let claims_json = serde_json::to_string(&claims).unwrap();
let payload = URL_SAFE.encode(claims_json.as_bytes());
let sig = signing_key.sign(payload.as_bytes());
let sig_b64 = base64::engine::general_purpose::STANDARD.encode(sig.to_bytes());
```

Use the same `claims` field types/order as `LicenseClaims` in `license.rs` (`plan` is serialized as a serde enum; match the desktop app’s JSON exactly).

## CI (GitHub Actions)

Add `KLIPPRR_LICENSE_ED25519_PUB_B64` as a **repository secret** and export it in the job `env` before `cargo tauri build` / `tauri-action` so release binaries enforce signatures.

The server-side signer (Stripe webhook + activation-code edge function) additionally needs `KLIPPRR_LICENSE_ED25519_PRIV_B64` in env/secrets (standard base64 of the 32-byte signing seed).

Do **not** commit the private key; only the public key (or its base64) is embedded in the app.
