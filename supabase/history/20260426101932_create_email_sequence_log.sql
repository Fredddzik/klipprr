CREATE TABLE public.email_sequence_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_key   text        NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_key)
);

ALTER TABLE public.email_sequence_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_sequence_log IS 'Tracks which onboarding emails have been sent to each user to prevent duplicates.';
COMMENT ON COLUMN public.email_sequence_log.email_key IS 'One of: welcome, day1_nudge, day3_inactive, day3_activated, day7_upgrade, day14_lasttouch';
