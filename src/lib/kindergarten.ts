export type ReservationStatus = "reserved" | "checked_in" | "checked_out" | "cancelled" | "no_show";

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  reserved: "예약",
  checked_in: "등원",
  checked_out: "하원",
  cancelled: "취소",
  no_show: "노쇼",
};

export const STATUS_STYLES: Record<ReservationStatus, string> = {
  reserved: "bg-secondary text-secondary-foreground",
  checked_in: "bg-primary text-primary-foreground",
  checked_out: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-warning/25 text-warning-foreground",
};

export const GENDER_LABELS: Record<string, string> = {
  male: "수컷",
  female: "암컷",
  unknown: "미입력",
};

export const PAYMENT_LABELS: Record<string, string> = {
  paid: "결제완료",
  unpaid: "미결제",
  refunded: "환불",
};

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateKorean(key: string): string {
  const [y, m, d] = key.split("-");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(key + "T00:00:00").getDay()];
  return `${y}년 ${Number(m)}월 ${Number(d)}일 (${weekday})`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 5);
}

export function formatWon(value: number | null | undefined): string {
  return `${(value ?? 0).toLocaleString("ko-KR")}원`;
}

export function ageLabel(birthDate: string | null): string {
  if (!birthDate) return "나이 미입력";
  const birth = new Date(birthDate + "T00:00:00");
  const months = Math.max(
    0,
    (new Date().getFullYear() - birth.getFullYear()) * 12 + (new Date().getMonth() - birth.getMonth()),
  );
  const years = Math.floor(months / 12);
  return years > 0 ? `${years}살 ${months % 12}개월` : `${months}개월`;
}

export function monthMatrix(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export type ServiceType = "kindergarten" | "hotel" | "daily_care" | "grooming";

export const SERVICE_TYPES: ServiceType[] = ["kindergarten", "hotel", "daily_care", "grooming"];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  kindergarten: "유치원",
  hotel: "호텔",
  daily_care: "데일리케어",
  grooming: "미용",
};

export const SERVICE_STYLES: Record<ServiceType, string> = {
  kindergarten: "bg-primary/12 text-primary border-primary/25",
  hotel: "bg-accent/20 text-accent-foreground/70 border-accent/35",
  daily_care: "bg-rose-300/10 text-rose-400/80 border-rose-300/25",
  grooming: "bg-warning/20 text-warning-foreground/70 border-warning/35",
};

/** 서비스별 등원/하원 버튼 문구 */
export const SERVICE_ACTION_LABELS: Record<ServiceType, { checkIn: string; checkOut: string }> = {
  kindergarten: { checkIn: "등원", checkOut: "하원" },
  hotel: { checkIn: "입실", checkOut: "퇴실" },
  daily_care: { checkIn: "케어 시작", checkOut: "케어 종료" },
  grooming: { checkIn: "미용 시작", checkOut: "미용 완료" },
};

/** 09:00 ~ 19:00, 30분 단위 미용 예약 슬롯 */
export const GROOMING_SLOTS: string[] = Array.from({ length: 21 }, (_, i) => {
  const total = 9 * 60 + i * 30;
  return `${`${Math.floor(total / 60)}`.padStart(2, "0")}:${`${total % 60}`.padStart(2, "0")}`;
});

export function addMinutes(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${`${Math.floor(total / 60) % 24}`.padStart(2, "0")}:${`${total % 60}`.padStart(2, "0")}`;
}

export function addDays(key: string, days: number): string {
  const d = new Date(key + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function nightsBetween(start: string, end: string): number {
  const ms = new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

export function stayLabel(start: string, end: string): string {
  const nights = nightsBetween(start, end);
  return nights > 0 ? `${nights}박 ${nights + 1}일` : "당일";
}

/** 예약이 걸쳐 있는 모든 날짜 키 목록 */
export function dateRangeKeys(start: string, end: string | null): string[] {
  if (!end || end <= start) return [start];
  const keys: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return keys;
}
