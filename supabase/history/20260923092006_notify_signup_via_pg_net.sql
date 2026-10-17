-- The signup notification trigger called supabase_functions.http_request(), a schema
-- created by Supabase's Database Webhooks feature and not present in this project. Every
-- signup therefore hit the exception handler and the founder was never told about any of
-- them. pg_net is the supported way to make an outbound HTTP call from Postgres.
create extension if not exists pg_net;
-- Function body: see ../schema.sql, handle_new_signup_notification (identical).
