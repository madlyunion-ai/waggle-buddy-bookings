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

export function vaccineWarning(expires: string | null): boolean {
  if (!expires) return true;
  return new Date(expires + "T00:00:00").getTime() < Date.now();
}
