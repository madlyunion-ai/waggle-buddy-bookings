CREATE UNIQUE INDEX IF NOT EXISTS owners_external_id_key ON public.owners (external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dogs_external_id_key ON public.dogs (external_id) WHERE external_id IS NOT NULL;
ALTER TABLE public.dogs ADD COLUMN IF NOT EXISTS synced_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL DEFAULT 'pets',
  owners_upserted integer NOT NULL DEFAULT 0,
  dogs_upserted integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_log TO authenticated;
GRANT ALL ON public.sync_log TO service_role;

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage sync_log" ON public.sync_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER sync_log_updated_at BEFORE UPDATE ON public.sync_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();