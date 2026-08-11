-- 호텔 이용권에서 이용가능 요일(전체/평일/주말)을 선택할 수 있도록 컬럼 추가
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS available_days text;
