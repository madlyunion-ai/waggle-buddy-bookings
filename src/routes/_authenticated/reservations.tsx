import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  SERVICE_LABELS,
  SERVICE_STYLES,
  STATUS_LABELS,
  STATUS_STYLES,
  formatDateKorean,
  formatTime,
  stayLabel,
  type ReservationStatus,
  type ServiceType,
} from "@/lib/kindergarten";

export const Route = createFileRoute("/_authenticated/reservations")({
  head: () => ({
    meta: [
      { title: "예약 정보 | 허그앤멍 예약관리" },
      { name: "description", content: "등록된 유치원·호텔·데일리케어·미용 예약을 한 눈에 조회합니다." },
      { property: "og:title", content: "예약 정보 | 허그앤멍 예약관리" },
      { property: "og:description", content: "전체 예약 목록 조회 및 상태 확인" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReservationsPage,
});

type Row = {
  id: string;
  reserved_date: string;
  end_date: string | null;
  drop_off_time: string | null;
  pick_up_time: string | null;
  status: ReservationStatus;
  service_type: ServiceType;
  memo: string | null;
  created_at: string;
  dogs: { name: string; breed: string | null; owners: { name: string; phone: string | null } | null } | null;
};

function ReservationsPage() {
  const [keyword, setKeyword] = useState("");
  const [service, setService] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const query = useQuery({
    queryKey: ["reservations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          "id, reserved_date, end_date, drop_off_time, pick_up_time, status, service_type, memo, created_at, dogs(name, breed, owners(name, phone))",
        )
        .order("reserved_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = (query.data ?? []).filter((row) => {
    if (service !== "all" && row.service_type !== service) return false;
    if (status !== "all" && row.status !== status) return false;
    const k = keyword.trim().toLowerCase();
    if (!k) return true;
    return [row.dogs?.name, row.dogs?.breed, row.dogs?.owners?.name, row.dogs?.owners?.phone]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(k));
  });

  return (
    <AppShell
      title="예약 정보"
      description="등록된 전체 예약 목록입니다. 서비스 종류와 상태로 필터링할 수 있습니다."
      action={
        <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /> 새로고침
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="bg-white pl-9"
            placeholder="강아지 이름, 견종, 보호자 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger className="w-[150px] bg-white">
            <SelectValue placeholder="서비스" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 서비스</SelectItem>
            {Object.entries(SERVICE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[130px] bg-white">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">총 {rows.length.toLocaleString("ko-KR")}건</span>
      </div>

      <div className="surface-card overflow-hidden p-0">
        <div className="hidden grid-cols-[1fr_1fr_1.4fr_1fr_1.2fr_0.7fr_1.2fr] gap-3 border-b border-border bg-muted/50 px-4 py-3 text-xs font-bold text-muted-foreground lg:grid">
          <span>강아지</span>
          <span>보호자</span>
          <span>예약일</span>
          <span>서비스</span>
          <span>시간 · 기간</span>
          <span>상태</span>
          <span>메모</span>
        </div>

        {query.isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">예약 정보를 불러오는 중…</p>
        ) : query.isError ? (
          <p className="p-8 text-center text-sm font-semibold text-destructive">
            예약 정보를 불러오지 못했습니다. 다시 시도해 주세요.
          </p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 예약이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-2 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-secondary/50 lg:grid-cols-[1fr_1fr_1.4fr_1fr_1.2fr_0.7fr_1.2fr]"
              >
                <div className="col-span-2 flex items-center gap-2.5 lg:col-span-1">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-sm font-extrabold text-primary">
                    {(row.dogs?.name ?? "?").slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{row.dogs?.name ?? "삭제된 원생"}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.dogs?.breed ?? "견종 미입력"}</p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate">{row.dogs?.owners?.name ?? "보호자 미확인"}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.dogs?.owners?.phone ?? "-"}</p>
                </div>
                <span className="truncate text-muted-foreground">{formatDateKorean(row.reserved_date)}</span>
                <span>
                  <Badge variant="outline" className={SERVICE_STYLES[row.service_type]}>
                    {SERVICE_LABELS[row.service_type] ?? row.service_type}
                  </Badge>
                </span>
                <span className="text-muted-foreground">
                  {row.service_type === "hotel" && row.end_date
                    ? `${stayLabel(row.reserved_date, row.end_date)} · ${row.end_date}`
                    : `${formatTime(row.drop_off_time)} ~ ${formatTime(row.pick_up_time)}`}
                </span>
                <span>
                  <span className={`rounded-md px-2 py-1 text-xs font-bold ${STATUS_STYLES[row.status]}`}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                </span>
                <span className="col-span-2 truncate text-xs text-muted-foreground lg:col-span-1">
                  {row.memo || "-"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
