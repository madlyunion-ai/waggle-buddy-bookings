import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Clock, LogIn, LogOut, Plus, Users } from "lucide-react";
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
import {
  STATUS_LABELS,
  STATUS_STYLES,
  formatDateKorean,
  formatTime,
  monthMatrix,
  toDateKey,
  type ReservationStatus,
} from "@/lib/kindergarten";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "오늘 등원 현황 | 멍멍유치원 예약관리" },
      { name: "description", content: "날짜별 예약 캘린더와 등하원 체크인으로 유치원 하루를 한눈에 관리합니다." },
      { property: "og:title", content: "오늘 등원 현황 | 멍멍유치원 예약관리" },
      { property: "og:description", content: "날짜별 예약 캘린더와 등하원 체크인 현황" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

type Row = {
  id: string;
  reserved_date: string;
  drop_off_time: string;
  pick_up_time: string;
  status: ReservationStatus;
  memo: string | null;
  pass_id: string | null;
  dogs: { id: string; name: string; breed: string | null; owners: { name: string; phone: string } | null } | null;
};

function DashboardPage() {
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toDateKey(new Date()));

  const monthStart = toDateKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const monthEnd = toDateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));

  const monthQuery = useQuery({
    queryKey: ["reservations", "month", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, reserved_date, status")
        .gte("reserved_date", monthStart)
        .lte("reserved_date", monthEnd);
      if (error) throw error;
      return data ?? [];
    },
  });

  const dayQuery = useQuery({
    queryKey: ["reservations", "day", selected],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          "id, reserved_date, drop_off_time, pick_up_time, status, memo, pass_id, dogs(id, name, breed, owners(name, phone))",
        )
        .eq("reserved_date", selected)
        .order("drop_off_time");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const countsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of monthQuery.data ?? []) {
      if (r.status === "cancelled") continue;
      map[r.reserved_date] = (map[r.reserved_date] ?? 0) + 1;
    }
    return map;
  }, [monthQuery.data]);

  const rows = dayQuery.data ?? [];
  const active = rows.filter((r) => r.status !== "cancelled");
  const inside = rows.filter((r) => r.status === "checked_in");
  const done = rows.filter((r) => r.status === "checked_out");

  const updateStatus = useMutation({
    mutationFn: async ({ row, status }: { row: Row; status: ReservationStatus }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "checked_in") patch.checked_in_at = new Date().toISOString();
      if (status === "checked_out") patch.checked_out_at = new Date().toISOString();
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

  return (
    <AppShell
      title={formatDateKorean(selected)}
      description="예약 캘린더에서 날짜를 선택하면 해당 날짜의 등하원 현황이 표시됩니다."
      action={<NewReservationDialog defaultDate={selected} />}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={<CalendarCheck className="size-5" />} label="오늘 예약" value={active.length} />
        <StatCard icon={<Users className="size-5" />} label="현재 등원 중" value={inside.length} highlight />
        <StatCard icon={<Clock className="size-5" />} label="하원 완료" value={done.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="surface-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">
              {anchor.getFullYear()}년 {anchor.getMonth() + 1}월
            </h2>
            <div className="flex gap-1">
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
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d) => {
              const key = toDateKey(d);
              const isMonth = d.getMonth() === anchor.getMonth();
              const isSelected = key === selected;
              const count = countsByDate[key] ?? 0;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`flex h-14 flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isMonth
                        ? "hover:bg-secondary"
                        : "text-muted-foreground/50"
                  }`}
                >
                  <span>{d.getDate()}</span>
                  {count > 0 ? (
                    <span
                      className={`mt-0.5 rounded-full px-1.5 text-[10px] font-bold ${
                        isSelected ? "bg-primary-foreground/20" : "bg-accent/30 text-accent-foreground"
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          {dayQuery.isLoading ? (
            <div className="surface-card p-8 text-center text-sm text-muted-foreground">불러오는 중…</div>
          ) : rows.length === 0 ? (
            <div className="surface-card p-10 text-center">
              <p className="font-semibold">이 날짜에 등록된 예약이 없습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">오른쪽 위 “예약 등록”으로 추가해 보세요.</p>
            </div>
          ) : (
            rows.map((row) => (
              <article key={row.id} className="surface-card flex flex-wrap items-center gap-4 p-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary font-display text-lg font-extrabold text-primary">
                  {row.dogs?.name?.slice(0, 1) ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-bold">{row.dogs?.name ?? "삭제된 강아지"}</h3>
                    <Badge className={STATUS_STYLES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {row.dogs?.breed ?? "견종 미입력"} · 보호자 {row.dogs?.owners?.name ?? "-"} ·{" "}
                    {row.dogs?.owners?.phone ?? "-"}
                  </p>
                  {row.memo ? <p className="mt-1 text-sm text-accent-foreground">메모: {row.memo}</p> : null}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatTime(row.drop_off_time)} ~ {formatTime(row.pick_up_time)}
                </div>
                <div className="flex gap-2">
                  {row.status === "reserved" ? (
                    <>
                      <Button size="sm" onClick={() => updateStatus.mutate({ row, status: "checked_in" })}>
                        <LogIn className="size-4" /> 등원
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus.mutate({ row, status: "cancelled" })}
                      >
                        취소
                      </Button>
                    </>
                  ) : null}
                  {row.status === "checked_in" ? (
                    <Button size="sm" variant="secondary" onClick={() => updateStatus.mutate({ row, status: "checked_out" })}>
                      <LogOut className="size-4" /> 하원
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </AppShell>
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
    <div className={`surface-card flex items-center gap-4 p-5 ${highlight ? "border-primary/40" : ""}`}>
      <div
        className={`flex size-10 items-center justify-center rounded-xl ${
          highlight ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-extrabold">{value}</p>
      </div>
    </div>
  );
}

function NewReservationDialog({ defaultDate }: { defaultDate: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dogId, setDogId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [dropOff, setDropOff] = useState("09:00");
  const [pickUp, setPickUp] = useState("18:00");
  const [memo, setMemo] = useState("");

  const dogsQuery = useQuery({
    queryKey: ["dogs", "options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dogs")
        .select("id, name, owners(name)")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: pass } = await supabase
        .from("passes")
        .select("id, total_count, used_count")
        .eq("dog_id", dogId)
        .eq("payment_status", "paid")
        .order("purchased_on", { ascending: true });
      const usable = (pass ?? []).find((p) => p.used_count < p.total_count);

      const { error } = await supabase.from("reservations").insert({
        dog_id: dogId,
        reserved_date: date,
        drop_off_time: dropOff,
        pick_up_time: pickUp,
        memo: memo || null,
        pass_id: usable?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("예약을 등록했습니다");
      setOpen(false);
      setMemo("");
      setDogId("");
    },
    onError: (e: Error) => toast.error("예약 등록에 실패했습니다", { description: e.message }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDate(defaultDate);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> 예약 등록
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>예약 등록</DialogTitle>
          <DialogDescription>결제 완료된 이용권이 있으면 자동으로 연결되어 등원 시 1회 차감됩니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>강아지</Label>
            <Select value={dogId} onValueChange={setDogId}>
              <SelectTrigger>
                <SelectValue placeholder="강아지를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {(dogsQuery.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} ({(d.owners as { name: string } | null)?.name ?? "보호자 미등록"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>날짜</Label>
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
          <Button disabled={!dogId || create.isPending} onClick={() => create.mutate()}>
            등록하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
