ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'kindergarten',
  ADD COLUMN IF NOT EXISTS end_date date;

CREATE INDEX IF NOT EXISTS reservations_service_type_idx ON public.reservations (service_type);