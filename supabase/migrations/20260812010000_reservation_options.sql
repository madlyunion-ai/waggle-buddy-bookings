-- 예약 설정에서 관리자가 직접 추가/수정/삭제할 수 있는 옵션(체중 구분, 커스텀 예약 타입)
CREATE TABLE IF NOT EXISTS public.reservation_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('service_type', 'weight_class')),
  value text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_options TO authenticated;
GRANT ALL ON public.reservation_options TO service_role;
ALTER TABLE public.reservation_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage reservation_options" ON public.reservation_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.reservation_options (kind, value, label, sort_order) VALUES
  ('weight_class', 'small', '소형', 0),
  ('weight_class', 'small_medium', '중소형', 1),
  ('weight_class', 'medium', '중형', 2),
  ('weight_class', 'medium_large', '중대형', 3),
  ('weight_class', 'large', '대형', 4)
ON CONFLICT (kind, value) DO NOTHING;
