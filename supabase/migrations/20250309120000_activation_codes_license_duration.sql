-- Add optional license duration to activation codes.
-- NULL = permanent Pro; N = Pro for N days from redemption.
-- redeem_activation_code should set licenses.expires_at = now() + license_duration_days
-- when this is set, and expires_at = NULL when this is NULL.

alter table public.activation_codes
  add column if not exists license_duration_days integer default null;

comment on column public.activation_codes.license_duration_days is
  'If set, the redeemed license expires this many days after redemption. NULL = permanent.';
