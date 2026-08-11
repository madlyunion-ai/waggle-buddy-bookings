-- 픽드랍 이용권의 운행구분(편도/왕복)을 저장하기 위한 컬럼 추가
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS trip_type text;
