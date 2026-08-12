-- 예약 타입 x 반려견 체중 구분별 단가를 저장하는 요금표 테이블
CREATE TABLE IF NOT EXISTS public.reservation_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL,
  weight_class text NOT NULL,
  price integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_type, weight_class)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_pricing TO authenticated;
GRANT ALL ON public.reservation_pricing TO service_role;
ALTER TABLE public.reservation_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage reservation_pricing" ON public.reservation_pricing FOR ALL TO authenticated USING (true) WITH CHECK (true);
