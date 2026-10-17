begin;

alter table public.licenses
  add column if not exists desktop_license_payload text;

alter table public.licenses
  add column if not exists desktop_license_sig text;

table public.licenses;

commit;
