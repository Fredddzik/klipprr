-- Add signed desktop license fields so the desktop can strictly verify license tokens.
-- `desktop_license_payload` is URL-safe base64 of UTF-8 JSON claims (see doc/LICENSE_SIGNING.md).
-- `desktop_license_sig` is standard base64 Ed25519 signature over the UTF-8 bytes of `desktop_license_payload`.

begin;

alter table public.licenses
  add column if not exists desktop_license_payload text;

alter table public.licenses
  add column if not exists desktop_license_sig text;

commit;

