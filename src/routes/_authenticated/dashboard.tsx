import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useMemo, useState } from "react";
import {
  BedDouble,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogIn,
  LogOut,
  Plus,
  Scissors,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
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

function DashboardPage() {
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toDateKey(new Date()));

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
  const inside = rows.filter((r) => r.status === "checked_in");
  const done = rows.filter((r) => r.status === "checked_out");

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

  return (
    <AppShell
      title="오늘의 운영 현황"
      description={`${formatDateKorean(selected)} · 서비스별 예약과 다가오는 시간을 한곳에서 확인하세요.`}
      action={<NewReservationDialog defaultDate={selected} />}
    >
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<CalendarCheck className="size-4" />}
          tint="bg-primary/12 text-primary"
          label="오늘 등원 예정"
          value={byType.kindergarten.length}
          unit="마리"
          note="클릭하여 강아지 목록 확인"
        />
        <SummaryCard
          icon={<BedDouble className="size-4" />}
          tint="bg-accent/25 text-accent-foreground"
          label="오늘 호텔 이용"
          value={byType.hotel.length}
          unit="마리"
          note={`오늘 입실 ${checkInToday}건`}
        />
        <SummaryCard
          icon={<Clock className="size-4" />}
          tint="bg-secondary text-primary"
          label="오늘 데이케어"
          value={byType.daily_care.length}
          unit="건"
          note="시간대별 예약 확인"
        />
        <SummaryCard
          icon={<Scissors className="size-4" />}
          tint="bg-warning/25 text-warning-foreground"
          label="오늘 미용"
          value={byType.grooming.length}
          unit="건"
          note="가까운 예약시간 확인"
        />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard icon={<CalendarCheck className="size-4" />} label="선택일 예약" value={active.length} />
        <StatCard icon={<Users className="size-4" />} label="현재 등원 중" value={inside.length} highlight />
        <StatCard icon={<Clock className="size-4" />} label="하원 완료" value={done.length} />
      </div>


      <div className="grid h-[calc(100vh-320px)] min-h-[520px] grid-cols-1 gap-4 lg:grid-cols-[80%_20%]">
      <section className="surface-card flex h-full min-h-0 flex-col overflow-hidden p-5">

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {anchor.getFullYear()}년 {anchor.getMonth() + 1}월
          </h2>
          <div className="flex items-center gap-2">
            <div className="mr-2 hidden items-center gap-2 md:flex">
              {SERVICE_TYPES.map((t) => (
                <span
                  key={t}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${SERVICE_STYLES[t]}`}
                >
                  {SERVICE_LABELS[t]}
                </span>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelected(todayKey)}>
              오늘
            </Button>
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

        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-muted-foreground">
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-1.5 overflow-auto">
          {cells.map((d) => {
            const key = toDateKey(d);
            const isMonth = d.getMonth() === anchor.getMonth();
            const isSelected = key === selected;
            const items = (byDate[key] ?? []).filter((r) => r.status !== "cancelled");
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={`flex min-h-[92px] flex-col items-stretch gap-1 rounded-xl border p-1.5 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/8"
                    : isMonth
                      ? "border-border bg-card hover:bg-secondary/60"
                      : "border-transparent bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between px-0.5">
                  <span
                    className={`text-xs font-bold ${
                      key === todayKey
                        ? "rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground"
                        : isMonth
                          ? ""
                          : "text-muted-foreground/50"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {items.length > 0 ? (
                    <span className="text-[10px] font-bold text-muted-foreground">{items.length}건</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {items.slice(0, 3).map((r) => (
                    <span
                      key={`${key}-${r.id}`}
                      className={`truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${SERVICE_STYLES[r.service_type]}`}
                    >
                      {SERVICE_LABELS[r.service_type]} · {r.dogs?.name ?? "-"}
                    </span>
                  ))}
                  {items.length > 3 ? (
                    <span className="px-1 text-[10px] font-semibold text-muted-foreground">
                      +{items.length - 3}건 더
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
        {monthQuery.isLoading ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">예약을 불러오는 중…</p>
        ) : null}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {monthStart.slice(0, 7)} 기준 · 호텔 예약은 숙박 기간 내내 표시됩니다.
        </p>
      </section>

      <section className="surface-card flex h-full min-h-0 flex-col p-4">
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
              <article key={row.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-sm font-extrabold text-primary">
                    {row.dogs?.name?.slice(0, 1) ?? "?"}
                  </div>
                  <h3 className="min-w-0 flex-1 truncate text-sm font-bold">
                    {row.dogs?.name ?? "삭제된 강아지"}
                  </h3>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="outline" className={`text-[10px] ${SERVICE_STYLES[row.service_type]}`}>
                    {SERVICE_LABELS[row.service_type]}
                  </Badge>
                  <Badge className={`text-[10px] ${STATUS_STYLES[row.status]}`}>
                    {STATUS_LABELS[row.status]}
                  </Badge>
                </div>
                <p className="mt-2 truncate text-[11px] text-muted-foreground">
                  {row.dogs?.owners?.name ?? "-"} · {row.dogs?.owners?.phone ?? "-"}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-foreground">
                  {row.service_type === "hotel" && row.end_date
                    ? `${stayLabel(row.reserved_date, row.end_date)} (${row.reserved_date} ~ ${row.end_date})`
                    : `${formatTime(row.drop_off_time)} ~ ${formatTime(row.pick_up_time)}`}
                </p>
                {row.memo ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-accent-foreground">메모: {row.memo}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.status === "reserved" ? (
                    <>
                      <Button
                        size="sm"
                        className="h-7 flex-1 px-2 text-[11px]"
                        onClick={() => updateStatus.mutate({ row, status: "checked_in" })}
                      >
                        <LogIn className="size-3.5" /> 등원
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => updateStatus.mutate({ row, status: "cancelled" })}
                      >
                        취소
                      </Button>
                    </>
                  ) : null}
                  {row.status === "checked_in" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 flex-1 px-2 text-[11px]"
                      onClick={() => updateStatus.mutate({ row, status: "checked_out" })}
                    >
                      <LogOut className="size-3.5" /> 하원
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      </div>
    </AppShell>

  );
}

function SummaryCard({
  icon,
  tint,
  label,
  value,
  unit,
  note,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: number;
  unit: string;
  note: string;
}) {
  return (
    <div className="surface-card relative overflow-hidden p-5">
      <div
        className={`absolute -right-4 -top-4 flex size-20 items-end justify-start rounded-full p-3.5 ${tint}`}
      >
        {icon}
      </div>
      <p className="text-sm font-bold">{label}</p>
      <p className="mt-3 text-3xl font-extrabold tracking-tight">
        {value}
        <span className="ml-1 text-xs font-semibold text-muted-foreground">{unit}</span>
      </p>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-primary" />
        {note}
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className={`surface-card flex items-center gap-3 p-4 ${highlight ? "border-primary/35" : ""}`}>
      <div
        className={`flex size-9 items-center justify-center rounded-lg ${
          highlight ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-xl font-extrabold">
          {value}
          <span className="ml-0.5 text-xs font-semibold text-muted-foreground">건</span>
        </p>
      </div>
    </div>
  );
}

function NewReservationDialog({ defaultDate }: { defaultDate: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType>("kindergarten");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberId, setMemberId] = useState("");
  const [petId, setPetId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(() => addDays(defaultDate, 1));
  const [dropOff, setDropOff] = useState("09:00");
  const [pickUp, setPickUp] = useState("18:00");
  const [slot, setSlot] = useState("10:00");
  const [memo, setMemo] = useState("");

  const fetchMembers = useServerFn(listExternalMembers);
  const fetchPets = useServerFn(listExternalPets);

  const membersQuery = useQuery({
    queryKey: ["external-members", memberSearch],
    queryFn: () => fetchMembers({ data: { search: memberSearch, limit: 30 } }),
    enabled: open,
  });

  const member = (membersQuery.data ?? []).find((m) => m.id === memberId) ?? null;

  const petsQuery = useQuery({
    queryKey: ["external-pets", memberId, member?.source ?? "owner"],
    queryFn: () => fetchPets({ data: { memberId, source: member?.source ?? "owner", search: member?.name ?? "" } }),
    enabled: open && !!memberId,
  });

  const pet = (petsQuery.data ?? []).find((p) => p.id === petId) ?? null;

  const create = useMutation({
    mutationFn: async () => {
      if (!member || !pet) throw new Error("회원과 반려견을 선택해 주세요.");

      // 외부 회원을 내부 보호자 레코드와 동기화
      const { data: existingOwner } = await supabase
        .from("owners")
        .select("id")
        .eq("external_id", member.id)
        .maybeSingle();
      let ownerId = existingOwner?.id ?? null;
      if (!ownerId) {
        const { data: inserted, error: ownerError } = await supabase
          .from("owners")
          .insert({
            name: member.name,
            phone: member.phone ?? "-",
            email: member.email,
            external_id: member.id,
            external_source: member.source,
          })
          .select("id")
          .single();
        if (ownerError) throw ownerError;
        ownerId = inserted.id;
      }

      // 외부 반려견을 내부 강아지 레코드와 동기화
      const { data: existingDog } = await supabase
        .from("dogs")
        .select("id")
        .eq("external_id", pet.id)
        .maybeSingle();
      let dogId = existingDog?.id ?? null;
      if (!dogId) {
        const { data: insertedDog, error: dogError } = await supabase
          .from("dogs")
          .insert({
            owner_id: ownerId,
            name: pet.name,
            breed: pet.breed,
            birth_date: pet.birthDate,
            weight_kg: pet.weight,
            external_id: pet.id,
          })
          .select("id")
          .single();
        if (dogError) throw dogError;
        dogId = insertedDog.id;
      }

      const { data: pass } = await supabase
        .from("passes")
        .select("id, total_count, used_count")
        .eq("dog_id", dogId)
        .eq("payment_status", "paid")
        .order("purchased_on", { ascending: true });
      const usable = (pass ?? []).find((p) => p.used_count < p.total_count);

      const times =
        serviceType === "grooming"
          ? { drop_off_time: slot, pick_up_time: addMinutes(slot, 30) }
          : { drop_off_time: dropOff, pick_up_time: pickUp };

      const { error } = await supabase.from("reservations").insert({
        dog_id: dogId,
        service_type: serviceType,
        reserved_date: date,
        end_date: serviceType === "hotel" ? endDate : null,
        ...times,
        memo: memo || null,
        pass_id: serviceType === "kindergarten" ? (usable?.id ?? null) : null,
      });
      if (error) throw error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("예약을 등록했습니다");
      setOpen(false);
      setMemo("");
      setPetId("");
    },
    onError: (e: Error) => toast.error("예약 등록에 실패했습니다", { description: e.message }),
  });

  const hotelInvalid = serviceType === "hotel" && nightsBetween(date, endDate) < 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDate(defaultDate);
          setEndDate(addDays(defaultDate, 1));
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> 예약 등록
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>예약 등록</DialogTitle>
          <DialogDescription>예약 타입에 따라 날짜와 시간 입력 방식이 달라집니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>예약 타입</Label>
            <div className="grid grid-cols-4 gap-2">
              {SERVICE_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={serviceType === t ? "default" : "outline"}
                  onClick={() => setServiceType(t)}
                >
                  {SERVICE_LABELS[t]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>회원 검색 (외부 회원 시스템)</Label>
            <Input
              value={memberSearch}
              placeholder="이름 또는 전화번호로 검색"
              onChange={(e) => {
                setMemberSearch(e.target.value);
                setMemberId("");
                setPetId("");
              }}
            />
            <Select
              value={memberId}
              onValueChange={(v) => {
                setMemberId(v);
                setPetId("");
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={membersQuery.isLoading ? "회원을 불러오는 중…" : "회원을 선택하세요"}
                />
              </SelectTrigger>
              <SelectContent>
                {(membersQuery.data ?? []).map((m) => (
                  <SelectItem key={`${m.source}-${m.id}`} value={m.id}>
                    {m.name} · {m.phone ?? "연락처 없음"}
                    {m.source === "user" ? " (직원)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {membersQuery.isError ? (
              <p className="text-xs font-semibold text-destructive">외부 회원 목록을 불러오지 못했습니다.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>강아지</Label>
            <Select value={petId} onValueChange={setPetId} disabled={!memberId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !memberId ? "회원을 먼저 선택하세요" : petsQuery.isLoading ? "불러오는 중…" : "강아지를 선택하세요"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(petsQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.breed ? ` · ${p.breed}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>


          {serviceType === "hotel" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>입실일</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (e.target.value >= endDate) setEndDate(addDays(e.target.value, 1));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>퇴실일</Label>
                  <Input type="date" min={addDays(date, 1)} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-semibold">
                숙박 기간: {stayLabel(date, endDate)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>입실 시간</Label>
                  <Input type="time" value={dropOff} onChange={(e) => setDropOff(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>퇴실 시간</Label>
                  <Input type="time" value={pickUp} onChange={(e) => setPickUp(e.target.value)} />
                </div>
              </div>
            </div>
          ) : serviceType === "grooming" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>시간 (30분 단위)</Label>
                <Select value={slot} onValueChange={setSlot}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROOMING_SLOTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s} ~ {addMinutes(s, 30)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>날짜{serviceType === "daily_care" ? " (하루)" : ""}</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>등원</Label>
                <Input type="time" value={dropOff} onChange={(e) => setDropOff(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>하원</Label>
                <Input type="time" value={pickUp} onChange={(e) => setPickUp(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>메모</Label>
            <Textarea
              value={memo}
              maxLength={500}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="약 복용, 픽업 담당자 등"
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!petId || hotelInvalid || create.isPending} onClick={() => create.mutate()}>
            등록하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
