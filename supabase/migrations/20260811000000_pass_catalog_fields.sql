-- 이용권 관리: 강아지에 종속되지 않는 이용권 상품(카탈로그) 등록을 지원
ALTER TABLE public.passes ALTER COLUMN dog_id DROP NOT NULL;
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS memo text;
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
