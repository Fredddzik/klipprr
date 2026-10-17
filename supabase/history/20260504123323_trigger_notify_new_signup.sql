-- Function called by the trigger on every new profile (= new signup)
CREATE OR REPLACE FUNCTION public.handle_new_signup_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM supabase_functions.http_request(
    'https://fmegrgbpeobamzivplyi.supabase.co/functions/v1/notify_new_signup',
    'POST',
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.notify_webhook_secret', true)
    ),
    jsonb_build_object(
      'id',         NEW.id,
      'email',      NEW.email,
      'created_at', NEW.created_at
    ),
    5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a notification failure block a signup
  RAISE WARNING 'notify_new_signup failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger fires after every new row in profiles (which is created on every auth signup)
CREATE TRIGGER on_new_signup_notify
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_signup_notification();
