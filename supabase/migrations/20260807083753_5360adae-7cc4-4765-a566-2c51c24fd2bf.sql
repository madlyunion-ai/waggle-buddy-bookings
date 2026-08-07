ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS username text;

UPDATE public.staff SET username = split_part(email, '@', 1) WHERE username IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_username_key ON public.staff (lower(username)) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.staff_login_email(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.staff
  WHERE lower(username) = lower(trim(_username))
     OR lower(email) = lower(trim(_username))
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.staff_login_email(text) TO anon, authenticated;