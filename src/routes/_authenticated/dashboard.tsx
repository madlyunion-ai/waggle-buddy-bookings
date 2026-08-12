import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  CalendarCheck,
  ChevronLeft,
  CalendarDays,
  ChevronRight,
  Clock,
  LogIn,
  LogOut,
  Plus,
  Scissors,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { NewReservationDialog } from "@/components/NewReservationDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { listExternalMembers, listExternalPets } from "@/lib/projectpet.functions";
import {
  GROOMING_SLOTS,
  SERVICE_ACTION_LABELS,
  SERVICE_LABELS,
  SERVICE_STYLES,
  SERVICE_TYPES,
  STATUS_LABELS,
  STATUS_STYLES,
  addDays,
  addMinutes,
  dateRangeKeys,
  formatDateKorean,
  formatTime,
  formatWon,
  monthMatrix,
  nightsBetween,
  stayLabel,
  toDateKey,
  type ReservationStatus,
  type ServiceType,
} from "@/lib/kindergarten";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "오늘 등원 현황 | 허그앤멍 예약관리" },
      {
        name: "description",
        content: "유치원·호텔·데일리케어·미용 예약을 캘린더에서 한눈에 보고 등하원을 체크합니다.",
      },
      { property: "og:title", content: "오늘 등원 현황 | 허그앤멍 예약관리" },
      { property: "og:description", content: "예약 캘린더와 등하원 체크인 현황" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

type PassInfo = {
  id: string;
  title: string;
  pass_type: string;
  price: number;
  total_count: number;
  used_count: number;
} | null;

type Row = {
  id: string;
  reserved_date: string;
  end_date: string | null;
  drop_off_time: string;
  pick_up_time: string;
  status: ReservationStatus;
  service_type: ServiceType;
  memo: string | null;
  pass_id: string | null;
  pickup_pass_id: string | null;
  pickup_requested: boolean;
  dropoff_requested: boolean;
  dogs: {
    id: string;
    name: string;
    breed: string | null;
    owners: { name: string; phone: string } | null;
  } | null;
  passes: PassInfo;
  pickup_passes: PassInfo;
};

const SELECT_COLUMNS =
  "id, reserved_date, end_date, drop_off_time, pick_up_time, status, service_type, memo, pass_id, pickup_pass_id, pickup_requested, dropoff_requested, dogs(id, name, breed, owners(name, phone)), passes!reservations_pass_id_fkey(id, title, pass_type, price, total_count, used_count), pickup_passes:passes!reservations_pickup_pass_id_fkey(id, title, pass_type, price, total_count, used_count)";

const PASS_TYPE_LABELS: Record<string, string> = {
  kindergarten: "유치원 이용권",
  hotel: "호텔 이용권",
  daily_care: "데이케어",
  grooming: "미용 기본",
  pickup_dropoff: "픽드랍",
  balance: "금액권",
};

/** 캘린더 막대(연속 예약 바)용 스타일 - 배경 불투명도 80%, 폰트는 흰색으로 통일 */
const SERVICE_BAR_STYLES: Record<ServiceType, string> = {
  kindergarten: "bg-primary/80 text-white border-primary/25",
  hotel: "bg-accent/80 text-white border-accent/35",
  daily_care: "bg-rose-300/80 text-white border-rose-300/45",
  grooming: "bg-warning/80 text-white border-warning/35",
};

/** 클래스 문자열 전체를 sm: 반응형 접두사로 감싸는 헬퍼 (데스크톱 전용 스타일 재사용) */
function sm(classes: string): string {
  return classes
    .split(" ")
    .filter(Boolean)
    .map((c) => `sm:${c}`)
    .join(" ");
}

/** 연박(퇴실일이 입실일 이후) 예약인지 여부 */
function isMultiDay(r: Row): boolean {
  return !!r.end_date && r.end_date > r.reserved_date;
}

/** 연박 예약을 우선(긴 일정일수록 먼저) 배치하고, 그다음 단일예약을 시간순으로 정렬 */
function sortForDisplay(items: Row[]): Row[] {
  return [...items].sort((a, b) => {
    const aMulti = isMultiDay(a) ? 0 : 1;
    const bMulti = isMultiDay(b) ? 0 : 1;
    if (aMulti !== bMulti) return aMulti - bMulti;
    if (aMulti === 0) {
      const aDur = nightsBetween(a.reserved_date, a.end_date!);
      const bDur = nightsBetween(b.reserved_date, b.end_date!);
      if (aDur !== bDur) return bDur - aDur;
    }
    return a.drop_off_time.localeCompare(b.drop_off_time);
  });
}

/** 한 주(7일) 안에서 예약을 겹치지 않는 레인에 배치해 연속 바 형태로 표시하기 위한 계산 */
const MAX_CALENDAR_LANES = 3;

type WeekSegment = { row: Row; startCol: number; span: number };

function computeWeekLanes(weekKeys: string[], reservations: Row[]) {
  const weekStart = weekKeys[0]!;
  const weekEnd = weekKeys[6]!;

  const segments: WeekSegment[] = [];
  for (const row of reservations) {
    const rowEnd = isMultiDay(row) ? row.end_date! : row.reserved_date;
    const segStart = row.reserved_date < weekStart ? weekStart : row.reserved_date;
    const segEnd = rowEnd > weekEnd ? weekEnd : rowEnd;
    if (segStart > segEnd) continue;
    const startCol = weekKeys.indexOf(segStart);
    const endCol = weekKeys.indexOf(segEnd);
    if (startCol === -1 || endCol === -1) continue;
    segments.push({ row, startCol, span: endCol - startCol + 1 });
  }

  const priorityOrder = sortForDisplay(segments.map((s) => s.row));
  const sortedSegments = priorityOrder
    .map((row) => segments.find((s) => s.row.id === row.id))
    .filter((s): s is WeekSegment => s !== undefined);

  // 레인별로 이미 배치된 구간들과 겹치지 않는 첫 레인을 찾는다 (직전 구간의 끝 컬럼만 보면
  // 정렬 순서상 나중에 처리되는, 더 이른 날짜의 단일예약이 실제로는 겹치지 않는데도
  // 잘못 밀려나는 문제가 있어 레인 내 전체 구간과 비교한다)
  const laneOccupied: { startCol: number; endCol: number }[][] = [];
  const placed: { seg: WeekSegment; lane: number }[] = [];
  for (const seg of sortedSegments) {
    const segEndCol = seg.startCol + seg.span - 1;
    let lane = laneOccupied.findIndex((ranges) =>
      ranges.every((r) => segEndCol < r.startCol || seg.startCol > r.endCol),
    );
    if (lane === -1) {
      lane = laneOccupied.length;
      laneOccupied.push([]);
    }
    laneOccupied[lane]!.push({ startCol: seg.startCol, endCol: segEndCol });
    placed.push({ seg, lane });
  }

  const hiddenCountByCol = Array(7).fill(0) as number[];
  for (const { seg, lane } of placed) {
    if (lane < MAX_CALENDAR_LANES) continue;
    for (let c = seg.startCol; c < seg.startCol + seg.span; c += 1) {
      hiddenCountByCol[c] = (hiddenCountByCol[c] ?? 0) + 1;
    }
  }

  return { placed: placed.filter((p) => p.lane < MAX_CALENDAR_LANES), hiddenCountByCol };
}

function DashboardPage() {
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toDateKey(new Date()));
  const [serviceFilter, setServiceFilter] = useState<ServiceType | "all">("all");
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [dayListDate, setDayListDate] = useState<string | null>(null);
  const [emptyDayAlertOpen, setEmptyDayAlertOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [passPopoverId, setPassPopoverId] = useState<string | null>(null);
  const [passPopoverAnchor, setPassPopoverAnchor] = useState<{
    bottom: number;
    right: number;
  } | null>(null);

  // 모바일(라인형 캘린더) 여부 - Tailwind sm 브레이크포인트(640px)와 동일 기준
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const update = () => setIsCompact(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const monthStart = toDateKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const monthEnd = toDateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
  const gridStart = toDateKey(monthMatrix(anchor)[0]!);
  const gridEnd = toDateKey(monthMatrix(anchor)[41]!);

  const monthQuery = useQuery({
    queryKey: ["reservations", "month", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(SELECT_COLUMNS)
        .lte("reserved_date", gridEnd)
        .or(`end_date.gte.${gridStart},and(end_date.is.null,reserved_date.gte.${gridStart})`)
        .order("drop_off_time");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const byDate = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const r of monthQuery.data ?? []) {
      for (const key of dateRangeKeys(r.reserved_date, r.end_date)) {
        (map[key] ??= []).push(r);
      }
    }
    return map;
  }, [monthQuery.data]);

  const rows = sortForDisplay((byDate[selected] ?? []).filter((r) => r.status !== "cancelled"));

  const updateStatus = useMutation({
    mutationFn: async ({ row, status }: { row: Row; status: ReservationStatus }) => {
      const now = new Date().toISOString();
      const patch = {
        status,
        ...(status === "checked_in" ? { checked_in_at: now } : {}),
        ...(status === "checked_out" ? { checked_out_at: now } : {}),
      };
      const { error } = await supabase.from("reservations").update(patch).eq("id", row.id);
      if (error) throw error;

      if (status === "checked_in" && row.pass_id) {
        const { data: pass } = await supabase
          .from("passes")
          .select("used_count, total_count")
          .eq("id", row.pass_id)
          .maybeSingle();
        if (pass) {
          await supabase
            .from("passes")
            .update({ used_count: Math.min(pass.total_count, pass.used_count + 1) })
            .eq("id", row.pass_id);
        }
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["passes"] });
      toast.success(`${STATUS_LABELS[vars.status]} 처리했습니다`);
    },
    onError: (e: Error) => toast.error("처리에 실패했습니다", { description: e.message }),
  });

  const cells = monthMatrix(anchor);
  const todayKey = toDateKey(new Date());

  const filteredMonthReservations = useMemo(
    () =>
      (monthQuery.data ?? []).filter(
        (r) =>
          r.status !== "cancelled" && (serviceFilter === "all" || r.service_type === serviceFilter),
      ),
    [monthQuery.data, serviceFilter],
  );

  const weeks = useMemo(() => {
    const out: Date[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  // "오늘 이용정보"는 캘린더에서 다른 날짜를 클릭해도 항상 접속일(today) 기준으로 표시
  const todayActive = (byDate[todayKey] ?? []).filter((r) => r.status !== "cancelled");
  const todayByType = useMemo(() => {
    const base: Record<ServiceType, Row[]> = {
      kindergarten: [],
      hotel: [],
      daily_care: [],
      grooming: [],
    };
    for (const r of todayActive) base[r.service_type]?.push(r);
    return base;
  }, [todayActive]);

  const monthlyTotals = useMemo(() => {
    const totals: Record<ServiceType, number> = {
      kindergarten: 0,
      hotel: 0,
      daily_care: 0,
      grooming: 0,
    };
    for (const r of monthQuery.data ?? []) {
      if (r.status === "cancelled") continue;
      if (r.reserved_date < monthStart || r.reserved_date > monthEnd) continue;
      totals[r.service_type] += 1;
    }
    return totals;
  }, [monthQuery.data, monthStart, monthEnd]);

  const monthlyStatsItems = [
    { label: "유치원", value: monthlyTotals.kindergarten },
    { label: "호텔", value: monthlyTotals.hotel },
    { label: "데일리케어", value: monthlyTotals.daily_care },
    { label: "미용", value: monthlyTotals.grooming },
  ];
  const monthlyStatsTitle = `${anchor.getMonth() + 1}월 전체 예약현황`;

  return (
    <AppShell sidebarAction={<NewReservationDialog defaultDate={selected} />}>
      <div className="-mt-4 grid grid-cols-1 gap-4 sm:mt-0 lg:h-[calc(100vh-6rem)] lg:min-h-[560px] lg:grid-cols-[80%_20%]">
        <section className="mx-[-1rem] flex min-h-0 flex-col overflow-hidden bg-white pt-1 sm:surface-card sm:mx-0 sm:bg-card sm:p-5 lg:h-full">
          <div className="mb-0 flex items-center justify-between px-4 sm:mb-4 sm:px-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">
                {anchor.getFullYear()}년 {anchor.getMonth() + 1}월
              </h2>
              <span className="hidden items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-primary sm:inline-flex">
                <CalendarDays className="size-3.5" />
                {formatDateKorean(todayKey)}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => {
                  setAnchor(new Date());
                  setSelected(todayKey);
                }}
              >
                오늘
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <div className="mr-2 hidden items-center gap-2 md:flex">
                <button
                  type="button"
                  onClick={() => setServiceFilter("all")}
                  className={`cursor-pointer rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-bold text-muted-foreground transition-shadow ${
                    serviceFilter === "all" ? "ring-2 ring-muted-foreground/50 ring-offset-1" : ""
                  }`}
                >
                  전체
                </button>
                {SERVICE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setServiceFilter(t)}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-bold transition-shadow ${SERVICE_STYLES[t]} ${
                      serviceFilter === t ? "ring-2 ring-current ring-offset-1" : ""
                    }`}
                  >
                    {SERVICE_LABELS[t]}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0 border-b border-border px-4 pb-1.5 text-center text-xs font-bold sm:mb-1.5 sm:gap-1.5 sm:border-b-0 sm:px-0 sm:pb-0">
            {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
              <div
                key={d}
                className={`py-1 sm:rounded-xl sm:border sm:py-1.5 ${
                  i === 0
                    ? `text-rose-500 ${sm("border-rose-300/70 bg-rose-50")}`
                    : i === 6
                      ? `text-sky-600 ${sm("border-sky-300/70 bg-sky-50")}`
                      : `text-muted-foreground ${sm("border-border bg-secondary/60")}`
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[repeat(6,minmax(78px,1fr))] gap-0 border-b border-border pb-3 sm:grid-rows-6 sm:gap-1.5 sm:overflow-hidden sm:border-b-0 sm:pb-0">
            {weeks.map((week, weekIdx) => {
              const weekKeys = week.map((d) => toDateKey(d));
              const { placed, hiddenCountByCol } = computeWeekLanes(
                weekKeys,
                filteredMonthReservations,
              );
              return (
                <div key={weekIdx} className="relative min-h-0">
                  <div className="grid h-full grid-cols-7 gap-0 sm:gap-1.5">
                    {week.map((d, colIdx) => {
                      const key = weekKeys[colIdx]!;
                      const isMonth = d.getMonth() === anchor.getMonth();
                      const isSelected = key === selected;
                      const isToday = key === todayKey;
                      const dow = d.getDay();
                      const items = sortForDisplay(
                        (byDate[key] ?? []).filter(
                          (r) =>
                            r.status !== "cancelled" &&
                            (serviceFilter === "all" || r.service_type === serviceFilter),
                        ),
                      );
                      return (
                        <div
                          key={key}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelected(key);
                            if (isCompact) {
                              if (items.length > 0) setDayListDate(key);
                              else setEmptyDayAlertOpen(true);
                            } else {
                              setCreateDate(key);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            setSelected(key);
                            if (isCompact) {
                              if (items.length > 0) setDayListDate(key);
                              else setEmptyDayAlertOpen(true);
                            } else {
                              setCreateDate(key);
                            }
                          }}
                          className={`flex min-h-[44px] max-h-[92px] cursor-pointer flex-col items-stretch gap-0.5 overflow-hidden border-b border-border/60 p-1 text-left align-top transition-colors sm:min-h-[114px] sm:max-h-none sm:gap-1 sm:rounded-xl sm:border sm:p-1.5 ${
                            isSelected ? "bg-primary/5" : !isMonth ? "bg-[#f3f3f3]" : ""
                          } ${isToday ? `${sm("border-2 border-primary")}` : sm("border")} ${
                            isSelected
                              ? sm("bg-primary/8")
                              : isMonth
                                ? dow === 0
                                  ? sm(
                                      `bg-card hover:bg-rose-50/60 ${isToday ? "" : "border-rose-300/70"}`,
                                    )
                                  : dow === 6
                                    ? sm(
                                        `bg-card hover:bg-sky-50/60 ${isToday ? "" : "border-sky-300/70"}`,
                                      )
                                    : sm(
                                        `bg-card hover:bg-secondary/60 ${isToday ? "" : "border-border"}`,
                                      )
                                : sm(`bg-muted/40 ${isToday ? "" : "border-transparent"}`)
                          }`}
                        >
                          <div className="flex shrink-0 items-center justify-between px-0.5">
                            <span
                              className={`text-xs font-bold ${
                                key === todayKey
                                  ? "rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground"
                                  : !isMonth
                                    ? "text-muted-foreground/50"
                                    : dow === 0
                                      ? "text-rose-500"
                                      : dow === 6
                                        ? "text-sky-600"
                                        : ""
                              }`}
                            >
                              {d.getDate()}
                            </span>
                            {items.length > 0 ? (
                              <span className="hidden text-[10px] font-bold text-muted-foreground sm:inline">
                                {items.length}건
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 연박 예약이 여러 날짜에 걸쳐 하나의 막대로 이어지는 오버레이 (모바일/데스크톱 공통) */}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-[20px] grid grid-cols-7 gap-x-0.5 gap-y-px px-0.5 pb-1 sm:top-[28px] sm:gap-x-1.5 sm:gap-y-1 sm:px-1"
                    style={{ gridAutoRows: isCompact ? "13px" : "17px" }}
                  >
                    {placed.map(({ seg, lane }) => (
                      <div
                        key={seg.row.id}
                        style={{
                          gridColumn: `${seg.startCol + 1} / span ${seg.span}`,
                          gridRow: lane + 1,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(weekKeys[seg.startCol]!);
                          setDetailRow(seg.row);
                        }}
                        className={`pointer-events-auto mx-px flex cursor-pointer items-center gap-0.5 truncate rounded border px-1 text-[8px] font-semibold leading-[12px] sm:mx-0.5 sm:gap-1 sm:rounded-md sm:px-2 sm:text-[10px] sm:leading-[16px] ${SERVICE_BAR_STYLES[seg.row.service_type]}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{seg.row.dogs?.name ?? "-"}</span>
                        <span className="hidden shrink-0 sm:inline">
                          {seg.span > 1
                            ? `~${(seg.row.end_date ?? seg.row.reserved_date).slice(5).replace("-", "/")}`
                            : formatTime(seg.row.drop_off_time)}
                        </span>
                      </div>
                    ))}
                    {week.map((d, colIdx) =>
                      (hiddenCountByCol[colIdx] ?? 0) > 0 ? (
                        <button
                          key={`more-${weekIdx}-${colIdx}`}
                          type="button"
                          style={{
                            gridColumn: `${colIdx + 1} / span 1`,
                            gridRow: MAX_CALENDAR_LANES + 1,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const key = weekKeys[colIdx]!;
                            setSelected(key);
                            setDayListDate(key);
                          }}
                          className="pointer-events-auto mx-px flex items-center gap-0.5 truncate rounded px-0.5 text-[8px] font-bold text-primary hover:bg-primary/10 sm:mx-0.5 sm:gap-1 sm:rounded-md sm:px-1 sm:text-[10px]"
                        >
                          <Plus className="size-2.5 sm:size-3" /> {hiddenCountByCol[colIdx] ?? 0}개
                          더보기
                        </button>
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {monthQuery.isLoading ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">예약을 불러오는 중…</p>
          ) : null}
        </section>

        {/* 모바일: 전체예약현황 카드를 캘린더 아래에 표시 */}
        <div className="lg:hidden">
          <MonthlyStatsCard title={monthlyStatsTitle} items={monthlyStatsItems} />
        </div>

        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="hidden lg:block">
            <MonthlyStatsCard title={monthlyStatsTitle} items={monthlyStatsItems} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard
              icon={<CalendarCheck className="size-4" />}
              tint="bg-primary/12 text-primary"
              label="오늘 등원 예정"
              value={todayByType.kindergarten.length}
              unit="마리"
            />
            <SummaryCard
              icon={<BedDouble className="size-4" />}
              tint="bg-accent/25 text-accent-foreground"
              label="오늘 호텔 이용"
              value={todayByType.hotel.length}
              unit="마리"
            />
            <SummaryCard
              icon={<Clock className="size-4" />}
              tint="bg-rose-400/15 text-rose-400"
              label="오늘 데이케어"
              value={todayByType.daily_care.length}
              unit="건"
            />
            <SummaryCard
              icon={<Scissors className="size-4" />}
              tint="bg-warning/25 text-warning-foreground"
              label="오늘 미용"
              value={todayByType.grooming.length}
              unit="건"
            />
          </div>

          <section className="surface-card flex min-h-[220px] flex-1 flex-col p-4">
            <h2 className="mb-3 shrink-0 text-sm font-bold">
              {formatDateKorean(selected)} 예약
              <span className="ml-1 text-muted-foreground">({rows.length})</span>
            </h2>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-semibold">예약이 없습니다.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    “예약 등록”으로 추가해 보세요.
                  </p>
                </div>
              ) : (
                rows.map((row) => (
                  <article key={row.id} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-xs font-extrabold text-primary">
                        {row.dogs?.name?.slice(0, 1) ?? "?"}
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <h3 className="min-w-0 truncate text-sm font-bold">
                          {row.dogs?.name ?? "삭제된 강아지"}
                        </h3>
                        {row.passes || row.pickup_passes ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (passPopoverId === row.id) {
                                setPassPopoverId(null);
                                setPassPopoverAnchor(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setPassPopoverAnchor({
                                  bottom: window.innerHeight - rect.top + 4,
                                  right: window.innerWidth - rect.right,
                                });
                                setPassPopoverId(row.id);
                              }
                            }}
                            className="shrink-0 cursor-pointer rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"
                          >
                            이용권
                          </button>
                        ) : null}
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[10px] ${SERVICE_STYLES[row.service_type]}`}
                      >
                        {SERVICE_LABELS[row.service_type]}
                      </Badge>
                      <Badge className={`shrink-0 text-[10px] ${STATUS_STYLES[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </Badge>
                    </div>

                    <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                      <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        {row.dogs?.owners?.name ?? "-"}
                        {row.dogs?.owners?.phone && row.dogs.owners.phone !== "-"
                          ? ` · ${row.dogs.owners.phone}`
                          : ""}
                      </p>
                      <p className="shrink-0 text-[11px] font-bold text-foreground">
                        {row.service_type === "hotel" && row.end_date
                          ? `${row.reserved_date.slice(5)} ~ ${row.end_date.slice(5)}`
                          : `${formatTime(row.drop_off_time)} ~ ${formatTime(row.pick_up_time)}`}
                      </p>
                    </div>

                    {row.memo ? (
                      <p className="mt-1 line-clamp-2 text-[11px] text-accent-foreground">
                        메모: {row.memo}
                      </p>
                    ) : null}

                    {row.status === "reserved" || row.status === "checked_in" ? (
                      <div className="mt-2 flex items-center gap-2">
                        {row.status === "reserved" ? (
                          <>
                            <Button
                              size="sm"
                              className="h-8 flex-1 rounded-lg px-2 text-xs font-bold"
                              onClick={() => updateStatus.mutate({ row, status: "checked_in" })}
                            >
                              <LogIn className="size-3.5" />{" "}
                              {SERVICE_ACTION_LABELS[row.service_type].checkIn}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0 rounded-lg px-3 text-xs"
                              onClick={() => updateStatus.mutate({ row, status: "cancelled" })}
                            >
                              취소
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 flex-1 rounded-lg px-2 text-xs font-bold"
                            onClick={() => updateStatus.mutate({ row, status: "checked_out" })}
                          >
                            <LogOut className="size-3.5" />{" "}
                            {SERVICE_ACTION_LABELS[row.service_type].checkOut}
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {passPopoverId && passPopoverAnchor ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setPassPopoverId(null);
              setPassPopoverAnchor(null);
            }}
          />
          {(() => {
            const popoverRow = rows.find((r) => r.id === passPopoverId);
            if (!popoverRow) return null;
            return (
              <div
                className="fixed z-50 w-52 space-y-1.5 rounded-lg border border-border bg-card p-2.5 text-left shadow-lg"
                style={{ bottom: passPopoverAnchor.bottom, right: passPopoverAnchor.right }}
              >
                {popoverRow.passes ? (
                  <div>
                    <p className="truncate text-xs font-bold">{popoverRow.passes.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {popoverRow.passes.pass_type === "balance" ? (
                        <>
                          사용 {formatWon(popoverRow.passes.used_count)} / 잔액{" "}
                          {formatWon(
                            Math.max(
                              0,
                              popoverRow.passes.total_count - popoverRow.passes.used_count,
                            ),
                          )}
                        </>
                      ) : (
                        <>
                          {PASS_TYPE_LABELS[popoverRow.passes.pass_type] ??
                            popoverRow.passes.pass_type}{" "}
                          · {formatWon(popoverRow.passes.price)}
                        </>
                      )}
                    </p>
                  </div>
                ) : null}
                {popoverRow.pickup_passes ? (
                  <div className={popoverRow.passes ? "border-t border-border pt-1.5" : ""}>
                    <p className="truncate text-xs font-bold">
                      {popoverRow.pickup_passes.title}
                      {popoverRow.pickup_requested && popoverRow.dropoff_requested
                        ? " (픽업+드랍)"
                        : popoverRow.pickup_requested
                          ? " (픽업)"
                          : popoverRow.dropoff_requested
                            ? " (드랍)"
                            : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {popoverRow.pickup_passes.pass_type === "balance" ? (
                        <>
                          사용 {formatWon(popoverRow.pickup_passes.used_count)} / 잔액{" "}
                          {formatWon(
                            Math.max(
                              0,
                              popoverRow.pickup_passes.total_count -
                                popoverRow.pickup_passes.used_count,
                            ),
                          )}
                        </>
                      ) : (
                        formatWon(popoverRow.pickup_passes.price)
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </>
      ) : null}

      <NewReservationDialog
        defaultDate={createDate ?? selected}
        open={createDate !== null}
        onOpenChange={(next) => setCreateDate(next ? (createDate ?? selected) : null)}
        hideTrigger
      />

      {/* 모바일 전용 FAB: 예약하기 */}
      <button
        type="button"
        onClick={() => setCreateDate(selected)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-1.5 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-transform active:scale-95 lg:hidden"
      >
        <Plus className="size-4" />
        예약하기
      </button>

      <Dialog
        open={dayListDate !== null}
        onOpenChange={(next) => setDayListDate(next ? dayListDate : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dayListDate ? formatDateKorean(dayListDate) : ""} 예약</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(dayListDate
              ? sortForDisplay(
                  (byDate[dayListDate] ?? []).filter(
                    (r) =>
                      r.status !== "cancelled" &&
                      (serviceFilter === "all" || r.service_type === serviceFilter),
                  ),
                )
              : []
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setDayListDate(null);
                  setDetailRow(r);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-secondary/50"
              >
                <Badge
                  variant="outline"
                  className={`text-[10px] ${SERVICE_STYLES[r.service_type]}`}
                >
                  {SERVICE_LABELS[r.service_type]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {r.dogs?.name ?? "-"}
                </span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {r.service_type === "hotel" && r.end_date
                    ? `${r.reserved_date.slice(5)} ~ ${r.end_date.slice(5)}`
                    : `${formatTime(r.drop_off_time)} ~ ${formatTime(r.pick_up_time)}`}
                </span>
                <Badge className={`shrink-0 text-[10px] ${STATUS_STYLES[r.status]}`}>
                  {STATUS_LABELS[r.status]}
                </Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailRow !== null} onOpenChange={(next) => !next && setDetailRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>예약 상세</DialogTitle>
          </DialogHeader>
          {detailRow ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-sm font-extrabold text-primary">
                  {detailRow.dogs?.name?.slice(0, 1) ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {detailRow.dogs?.name ?? "삭제된 강아지"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {detailRow.dogs?.breed ?? "견종 미입력"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] ${SERVICE_STYLES[detailRow.service_type]}`}
                >
                  {SERVICE_LABELS[detailRow.service_type]}
                </Badge>
                <Badge className={`shrink-0 text-[10px] ${STATUS_STYLES[detailRow.status]}`}>
                  {STATUS_LABELS[detailRow.status]}
                </Badge>
              </div>

              <dl className="divide-y divide-border rounded-xl border border-border">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="shrink-0 text-xs font-semibold text-muted-foreground">보호자</dt>
                  <dd className="truncate text-right font-semibold">
                    {detailRow.dogs?.owners?.name ?? "-"}
                    {detailRow.dogs?.owners?.phone && detailRow.dogs.owners.phone !== "-"
                      ? ` · ${detailRow.dogs.owners.phone}`
                      : ""}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="shrink-0 text-xs font-semibold text-muted-foreground">일정</dt>
                  <dd className="truncate text-right font-semibold">
                    {detailRow.service_type === "hotel" && detailRow.end_date
                      ? `${detailRow.reserved_date} ~ ${detailRow.end_date}`
                      : detailRow.end_date && detailRow.end_date > detailRow.reserved_date
                        ? `${detailRow.reserved_date} ~ ${detailRow.end_date}`
                        : detailRow.reserved_date}
                    {" · "}
                    {formatTime(detailRow.drop_off_time)} ~ {formatTime(detailRow.pick_up_time)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="shrink-0 text-xs font-semibold text-muted-foreground">
                    이용권 적용
                  </dt>
                  <dd className="truncate text-right font-semibold">
                    {detailRow.passes ? (
                      <>
                        {detailRow.passes.title} · {formatWon(detailRow.passes.price)}
                      </>
                    ) : (
                      <span className="font-normal text-muted-foreground">미적용</span>
                    )}
                  </dd>
                </div>
                {detailRow.service_type === "kindergarten" ? (
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <dt className="shrink-0 text-xs font-semibold text-muted-foreground">픽드랍</dt>
                    <dd className="truncate text-right font-semibold">
                      {!detailRow.pickup_requested && !detailRow.dropoff_requested ? (
                        <span className="font-normal text-muted-foreground">신청 안 함</span>
                      ) : (
                        <>
                          {detailRow.pickup_requested ? "픽업 " : ""}
                          {detailRow.dropoff_requested ? "드랍 " : ""}
                          {detailRow.pickup_passes
                            ? `· ${detailRow.pickup_passes.title} · ${formatWon(detailRow.pickup_passes.price)}`
                            : ""}
                        </>
                      )}
                    </dd>
                  </div>
                ) : null}
                {detailRow.memo ? (
                  <div className="px-4 py-2.5 text-sm">
                    <dt className="text-xs font-semibold text-muted-foreground">메모</dt>
                    <dd className="mt-0.5 text-right font-semibold">{detailRow.memo}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={emptyDayAlertOpen} onOpenChange={setEmptyDayAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">
              {formatDateKorean(selected)}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              예약된 정보가 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction onClick={() => setEmptyDayAlertOpen(false)}>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function MonthlyStatsCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  return (
    <div className="surface-card shrink-0 px-3 py-2.5">
      <p className="text-[13px] font-bold">{title}</p>
      <div className="mt-2 overflow-hidden rounded-[8px] border-2 border-primary/30">
        <table className="w-full table-fixed border-collapse text-center">
          <thead>
            <tr>
              {items.map((item) => (
                <th
                  key={item.label}
                  className="px-1 pt-2.5 pb-1 text-[12px] font-semibold text-muted-foreground"
                >
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {items.map((item) => (
                <td key={item.label} className="px-1 pb-2.5">
                  <span className="text-2xl font-extrabold leading-tight tracking-tight text-primary">
                    {item.value}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  tint,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="shrink-0 rounded-[8px] border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold">{label}</p>
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${tint}`}>
          {icon}
        </span>
      </div>
      <p
        className={`mt-1 text-2xl font-extrabold leading-tight tracking-tight ${
          value > 0 ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
        <span className="ml-1 text-xs font-semibold text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}
