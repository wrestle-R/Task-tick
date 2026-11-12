-- Realtime is an invalidation hint. Cursor-based sync remains authoritative.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='code-todo') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public."code-todo"; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='movies-todo') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public."movies-todo"; END IF;
END $$;
CREATE TABLE public.tick_push_devices (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token text NOT NULL CHECK(length(token) BETWEEN 20 AND 4096),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,token)
);
ALTER TABLE public.tick_push_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tick_push_owner ON public.tick_push_devices FOR ALL TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tick_push_devices TO authenticated;
