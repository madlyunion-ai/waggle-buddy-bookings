import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { MobileSubTabLink } from "@/components/MobileSubTabs";
import { OwnerInfoDialog } from "@/components/OwnerInfoDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      {
        name: "description",
        content: "등록된 유치원·호텔·데일리케어·미용 예약을 한 눈에 조회합니다.",
      },
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
  dogs: {
    name: string;
    breed: string | null;
    owners: { name: string; phone: string | null; external_id: string | null } | null;
  } | null;
};

function ReservationsPage() {
  const [keyword, setKeyword] = useState("");
  const [service, setService] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const query = useQuery({
    queryKey: ["reservations", "all", startDate, endDate],
    queryFn: async () => {
      let request = supabase
        .from("reservations")
        .select(
          "id, reserved_date, end_date, drop_off_time, pick_up_time, status, service_type, memo, created_at, dogs(name, breed, owners(name, phone, external_id))",
        )
        .order("reserved_date", { ascending: false })
        .limit(500);
      if (startDate) request = request.gte("reserved_date", startDate);
      if (endDate) request = request.lte("reserved_date", endDate);
      const { data, error } = await request;
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
      hideTitleOnMobile
      description={
        <span className="hidden sm:inline">
          등록된 전체 예약 목록입니다. 서비스 종류와 상태로 필터링할 수 있습니다.
        </span>
      }
      action={
        <Button
          variant="outline"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="hidden sm:inline-flex"
        >
          <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /> 새로고침
        </Button>
      }
      mobileSubTabs={
        <>
          <MobileSubTabLink to="/dogs" active={false}>
            반려견 목록
          </MobileSubTabLink>
          <MobileSubTabLink to="/reservations" active>
            반려견 예약리스트
          </MobileSubTabLink>
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 sm:mb-3">
        <span className="w-full text-sm font-semibold text-muted-foreground sm:w-auto">
          기간 검색
        </span>
        <div className="flex flex-1 items-center gap-2 sm:flex-none">
          <Input
            type="date"
            className="h-[43px] flex-1 bg-white sm:h-9 sm:w-[150px] sm:flex-none"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className="shrink-0 text-sm text-muted-foreground">~</span>
          <Input
            type="date"
            className="h-[43px] flex-1 bg-white sm:h-9 sm:w-[150px] sm:flex-none"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        {startDate || endDate ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
          >
            초기화
          </Button>
        ) : null}
      </div>

      <div className="mb-2 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-[43px] bg-white pl-9 placeholder:text-sm sm:h-9"
            placeholder="강아지 이름, 견종, 보호자 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <Select value={service} onValueChange={setService}>
            <SelectTrigger className="h-[43px] bg-white sm:h-9 sm:w-[150px]">
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
            <SelectTrigger className="h-[43px] bg-white sm:h-9 sm:w-[130px]">
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
        </div>
        <span className="text-xs text-muted-foreground sm:ml-auto sm:text-sm">
          총 {rows.length.toLocaleString("ko-KR")}건
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-0 text-[11px] sm:min-w-[820px] sm:text-sm">
            <thead className="bg-secondary/60 text-center text-xs font-bold text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">강아지</th>
                <th className="whitespace-nowrap px-4 py-3">보호자</th>
                <th className="whitespace-nowrap px-4 py-3">예약일</th>
                <th className="hidden px-4 py-3 sm:table-cell">서비스</th>
                <th className="hidden px-4 py-3 sm:table-cell">시간 · 기간</th>
                <th className="hidden px-4 py-3 sm:table-cell">상태</th>
                <th className="hidden px-4 py-3 sm:table-cell">메모</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    예약 정보를 불러오는 중…
                  </td>
                </tr>
              ) : query.isError ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center font-semibold text-destructive">
                    예약 정보를 불러오지 못했습니다. 다시 시도해 주세요.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    조건에 맞는 예약이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border transition-colors hover:bg-secondary/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-xs font-extrabold text-primary sm:size-8 sm:text-sm">
                          {(row.dogs?.name ?? "?").slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold">{row.dogs?.name ?? "삭제된 원생"}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.dogs?.breed ?? "견종 미입력"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      <div className="flex min-w-0 items-center justify-center gap-1">
                        <span className="hidden truncate sm:inline">
                          {row.dogs?.owners?.name ?? "보호자 미확인"}
                          {row.dogs?.owners?.phone && row.dogs.owners.phone !== "-"
                            ? ` · ${row.dogs.owners.phone}`
                            : ""}
                        </span>
                        <OwnerInfoDialog
                          pet={{
                            id: row.dogs?.owners?.external_id ?? row.id,
                            name: row.dogs?.name ?? "삭제된 원생",
                            breed: row.dogs?.breed ?? null,
                            birthDate: null,
                            weight: null,
                            gender: null,
                            neutered: false,
                            ownerNames: row.dogs?.owners?.name ? [row.dogs.owners.name] : [],
                            ownerId: row.dogs?.owners?.external_id ?? null,
                            ownerPhone: row.dogs?.owners?.phone ?? null,
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-[10px] text-muted-foreground sm:text-sm">
                      {formatDateKorean(row.reserved_date)}
                    </td>
                    <td className="hidden px-4 py-3 text-center sm:table-cell">
                      <Badge variant="outline" className={SERVICE_STYLES[row.service_type]}>
                        {SERVICE_LABELS[row.service_type] ?? row.service_type}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-center text-muted-foreground sm:table-cell">
                      {row.service_type === "hotel" && row.end_date
                        ? `${stayLabel(row.reserved_date, row.end_date)} · ${row.end_date}`
                        : `${formatTime(row.drop_off_time)} ~ ${formatTime(row.pick_up_time)}`}
                    </td>
                    <td className="hidden px-4 py-3 text-center sm:table-cell">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-bold ${STATUS_STYLES[row.status]}`}
                      >
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-center text-xs text-muted-foreground sm:table-cell">
                      {row.memo || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
