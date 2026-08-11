-- 미용 이용권의 가격 방식(1회 정액/kg당)을 저장하기 위한 컬럼 추가
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS pricing_basis text;
