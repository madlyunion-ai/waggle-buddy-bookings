ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_source text;

ALTER TABLE public.dogs
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS owners_external_id_key ON public.owners (external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dogs_external_id_key ON public.dogs (external_id) WHERE external_id IS NOT NULL;