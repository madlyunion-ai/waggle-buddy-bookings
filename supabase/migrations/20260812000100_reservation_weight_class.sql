-- 예약 시 선택한 반려견 체중 구분을 기록하기 위한 컬럼 추가 (요금 계산에 사용)
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS weight_class text;
