-- 유치원 예약의 픽드랍(픽업/드랍) 신청 여부와 적용 이용권을 저장하기 위한 컬럼 추가
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS pickup_pass_id uuid REFERENCES public.passes(id);
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS pickup_requested boolean NOT NULL DEFAULT false;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS dropoff_requested boolean NOT NULL DEFAULT false;
