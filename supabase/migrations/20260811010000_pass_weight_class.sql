-- 유치원 이용권에서 반려견 체중 구분을 선택할 수 있도록 컬럼 추가
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS weight_class text;
