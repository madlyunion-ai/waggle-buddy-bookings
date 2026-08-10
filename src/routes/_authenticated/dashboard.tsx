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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      { name: "description", content: "유치원·호텔·데일리케어·미용 예약을 캘린더에서 한눈에 보고 등하원을 체크합니다." },
      { property: "og:title", content: "오늘 등원 현황 | 허그앤멍 예약관리" },
      { property: "og:description", content: "예약 캘린더와 등하원 체크인 현황" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

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
  dogs: { id: string; name: string; breed: string | null; owners: { name: string; phone: string } | null } | null;
};

const SELECT_COLUMNS =
  "id, reserved_date, end_date, drop_off_time, pick_up_time, status, service_type, memo, pass_id, dogs(id, name, breed, owners(name, phone))";

/** 모바일 캘린더 점 표시용 단색(솔리드) 배경 */
const SERVICE_DOT_COLORS: Record<ServiceType, string> = {
  kindergarten: "bg-primary",
  hotel: "bg-accent",
  daily_care: "bg-rose-400",
  grooming: "bg-warning",
};

function DashboardPage() {
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toDateKey(new Date()));
  const [serviceFilter, setServiceFilter] = useState<ServiceType | "all">("all");
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [dayListDate, setDayListDate] = useState<string | null>(null);


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

  const rows = byDate[selected] ?? [];
  const active = rows.filter((r) => r.status !== "cancelled");


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

  const byType = useMemo(() => {
    const base: Record<ServiceType, Row[]> = { kindergarten: [], hotel: [], daily_care: [], grooming: [] };
    for (const r of active) base[r.service_type]?.push(r);
    return base;
  }, [active]);
  const checkInToday = byType.hotel.filter((r) => r.reserved_date === selected).length;

  const monthlyTotals = useMemo(() => {
    const totals: Record<ServiceType, number> = { kindergarten: 0, hotel: 0, daily_care: 0, grooming: 0 };
    for (const r of monthQuery.data ?? []) {
      if (r.status === "cancelled") continue;
      if (r.reserved_date < monthStart || r.reserved_date > monthEnd) continue;
      totals[r.service_type] += 1;
    }
    return totals;
  }, [monthQuery.data, monthStart, monthEnd]);

  return (
    <AppShell sidebarAction={<NewReservationDialog defaultDate={selected} />}>
      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100vh-6rem)] lg:min-h-[560px] lg:grid-cols-[80%_20%]">


      <section className="surface-card flex min-h-0 flex-col overflow-hidden p-5 lg:h-full">



        <div className="mb-4 flex items-center justify-between">
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
                className={`rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-bold text-muted-foreground transition-shadow ${
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
                  className={`rounded-full border px-3 py-1.5 text-sm font-bold transition-shadow ${SERVICE_STYLES[t]} ${
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

        <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-xs font-bold">
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div
              key={d}
              className={`rounded-xl border py-1.5 ${
                i === 0
                  ? "border-rose-300/70 bg-rose-50 text-rose-500"
                  : i === 6
                    ? "border-sky-300/70 bg-sky-50 text-sky-600"
                    : "border-border bg-secondary/60 text-muted-foreground"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-1.5 overflow-hidden">
          {cells.map((d) => {
            const key = toDateKey(d);
            const isMonth = d.getMonth() === anchor.getMonth();
            const isSelected = key === selected;
            const isToday = key === todayKey;
            const dow = d.getDay();
            const items = (byDate[key] ?? []).filter(
              (r) => r.status !== "cancelled" && (serviceFilter === "all" || r.service_type === serviceFilter),
            );
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelected(key);
                  setCreateDate(key);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setSelected(key);
                    setCreateDate(key);
                  }
                }}
                className={`flex min-h-[56px] cursor-pointer overflow-hidden flex-col items-stretch gap-1 rounded-xl p-1.5 text-left align-top transition-colors sm:min-h-0 ${
                  isToday ? "border-2 border-primary" : "border"
                } ${
                  isSelected
                    ? "bg-primary/8"
                    : isMonth
                      ? dow === 0
                        ? `bg-card hover:bg-rose-50/60 ${isToday ? "" : "border-rose-300/70"}`
                        : dow === 6
                          ? `bg-card hover:bg-sky-50/60 ${isToday ? "" : "border-sky-300/70"}`
                          : `bg-card hover:bg-secondary/60 ${isToday ? "" : "border-border"}`
                      : `bg-muted/40 ${isToday ? "" : "border-transparent"}`
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
                    <span className="text-[10px] font-bold text-muted-foreground">{items.length}건</span>
                  ) : null}
                </div>
                {/* 데스크톱: 이름+시간이 보이는 전체 칩 목록 */}
                <div className="hidden min-h-0 flex-1 flex-col gap-0.5 overflow-hidden sm:flex">
                  {items.slice(0, 3).map((r) => (
                    <div
                      key={`${key}-${r.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(key);
                      }}
                      className={`flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${SERVICE_STYLES[r.service_type]}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{r.dogs?.name ?? "-"}</span>
                      <span className="shrink-0 opacity-80">
                        {r.service_type === "hotel" && r.end_date
                          ? `~${r.end_date.slice(5).replace("-", "/")}`
                          : formatTime(r.drop_off_time)}
                      </span>
                    </div>
                  ))}
                  {items.length > 3 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(key);
                        setDayListDate(key);
                      }}
                      className="mt-auto flex shrink-0 items-center gap-1 rounded-md px-1 text-[10px] font-bold text-primary hover:bg-primary/10"
                    >
                      <Plus className="size-3" /> {items.length - 3}개 더보기
                    </button>
                  ) : null}
                </div>

                {/* 모바일(360~390px): 구글 캘린더 스타일 점 표시로 요약 */}
                {items.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-0.5 sm:hidden">
                    {items.slice(0, 4).map((r) => (
                      <span
                        key={`${key}-dot-${r.id}`}
                        className={`size-1.5 shrink-0 rounded-full ${SERVICE_DOT_COLORS[r.service_type]}`}
                      />
                    ))}
                    {items.length > 4 ? (
                      <span className="text-[9px] font-bold leading-none text-muted-foreground">
                        +{items.length - 4}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>


        {monthQuery.isLoading ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">예약을 불러오는 중…</p>
        ) : null}
      </section>

      <div className="flex h-full min-h-0 flex-col gap-3">
        <MonthlyStatsCard
          title={`${anchor.getMonth() + 1}월 전체 예약현황`}
          items={[
            { label: "유치원", value: monthlyTotals.kindergarten },
            { label: "호텔", value: monthlyTotals.hotel },
            { label: "데일리케어", value: monthlyTotals.daily_care },
            { label: "미용", value: monthlyTotals.grooming },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard
            icon={<CalendarCheck className="size-4" />}
            tint="bg-primary/12 text-primary"
            label="오늘 등원 예정"
            value={byType.kindergarten.length}
            unit="마리"
          />
          <SummaryCard
            icon={<BedDouble className="size-4" />}
            tint="bg-accent/25 text-accent-foreground"
            label="오늘 호텔 이용"
            value={byType.hotel.length}
            unit="마리"
          />
          <SummaryCard
            icon={<Clock className="size-4" />}
            tint="bg-rose-400/15 text-rose-400"
            label="오늘 데이케어"
            value={byType.daily_care.length}
            unit="건"
          />
          <SummaryCard
            icon={<Scissors className="size-4" />}
            tint="bg-warning/25 text-warning-foreground"
            label="오늘 미용"
            value={byType.grooming.length}
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
              <p className="mt-1 text-xs text-muted-foreground">“예약 등록”으로 추가해 보세요.</p>
            </div>
          ) : (
            rows.map((row) => (
              <article key={row.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-xs font-extrabold text-primary">
                    {row.dogs?.name?.slice(0, 1) ?? "?"}
                  </div>
                  <h3 className="min-w-0 flex-1 truncate text-sm font-bold">
                    {row.dogs?.name ?? "삭제된 강아지"}
                  </h3>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${SERVICE_STYLES[row.service_type]}`}>
                    {SERVICE_LABELS[row.service_type]}
                  </Badge>
                  <Badge className={`shrink-0 text-[10px] ${STATUS_STYLES[row.status]}`}>
                    {STATUS_LABELS[row.status]}
                  </Badge>
                </div>

                <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                  <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {row.dogs?.owners?.name ?? "-"} · {row.dogs?.owners?.phone ?? "-"}
                  </p>
                  <p className="shrink-0 text-[11px] font-bold text-foreground">
                    {row.service_type === "hotel" && row.end_date
                      ? `${row.reserved_date.slice(5)} ~ ${row.end_date.slice(5)}`
                      : `${formatTime(row.drop_off_time)} ~ ${formatTime(row.pick_up_time)}`}
                  </p>
                </div>

                {row.memo ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-accent-foreground">메모: {row.memo}</p>
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
                          <LogIn className="size-3.5" /> {SERVICE_ACTION_LABELS[row.service_type].checkIn}
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
                        <LogOut className="size-3.5" /> {SERVICE_ACTION_LABELS[row.service_type].checkOut}
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

      <NewReservationDialog
        defaultDate={createDate ?? selected}
        open={createDate !== null}
        onOpenChange={(next) => setCreateDate(next ? (createDate ?? selected) : null)}
        hideTrigger
      />

      <Dialog open={dayListDate !== null} onOpenChange={(next) => setDayListDate(next ? dayListDate : null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dayListDate ? formatDateKorean(dayListDate) : ""} 예약</DialogTitle>
            <DialogDescription>이 날짜의 모든 예약 목록입니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(dayListDate ? (byDate[dayListDate] ?? []).filter((r) => r.status !== "cancelled") : []).map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
              >
                <Badge variant="outline" className={`text-[10px] ${SERVICE_STYLES[r.service_type]}`}>
                  {SERVICE_LABELS[r.service_type]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{r.dogs?.name ?? "-"}</span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {r.service_type === "hotel" && r.end_date
                    ? `${r.reserved_date.slice(5)} ~ ${r.end_date.slice(5)}`
                    : `${formatTime(r.drop_off_time)} ~ ${formatTime(r.pick_up_time)}`}
                </span>
                <Badge className={`shrink-0 text-[10px] ${STATUS_STYLES[r.status]}`}>
                  {STATUS_LABELS[r.status]}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
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
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${tint}`}>{icon}</span>
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
