import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import {
  BedDouble,
  CalendarCheck,
  Car,
  Clock,
  Pencil,
  Plus,
  Scissors,
  Search,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  SERVICE_LABELS,
  SERVICE_STYLES,
  SERVICE_TYPES,
  formatWon,
  type ServiceType,
} from "@/lib/kindergarten";

type PassType = ServiceType | "pickup_dropoff";

const PASS_TYPES: PassType[] = [...SERVICE_TYPES, "pickup_dropoff"];

const PASS_TYPE_LABELS: Record<PassType, string> = {
  ...SERVICE_LABELS,
  pickup_dropoff: "픽드랍",
};

const PASS_TYPE_STYLES: Record<PassType, string> = {
  ...SERVICE_STYLES,
  pickup_dropoff: "bg-sky-300/10 text-sky-500/80 border-sky-300/45",
};

const PASS_TYPE_ICONS: Record<PassType, typeof CalendarCheck> = {
  kindergarten: CalendarCheck,
  hotel: BedDouble,
  daily_care: Clock,
  grooming: Scissors,
  pickup_dropoff: Car,
};

const TRIP_TYPES = [
  { value: "one_way", label: "편도" },
  { value: "round_trip", label: "왕복" },
] as const;

function tripTypeLabel(value: string | null) {
  if (!value) return null;
  return TRIP_TYPES.find((t) => t.value === value)?.label ?? value;
}

const WEIGHT_CLASSES = [
  { value: "small", label: "소형(2~4.9kg)" },
  { value: "small_medium", label: "중소형(5~9.9kg)" },
  { value: "medium", label: "중형(10~14.9kg)" },
  { value: "medium_large", label: "중대형(15~19.9kg)" },
  { value: "large", label: "대형(20kg이상)" },
  { value: "etc", label: "기타" },
] as const;

function weightClassLabel(value: string | null) {
  if (!value) return null;
  return WEIGHT_CLASSES.find((w) => w.value === value)?.label ?? value;
}

const AVAILABLE_DAYS = [
  { value: "all", label: "전체" },
  { value: "weekday", label: "평일" },
  { value: "weekend", label: "주말" },
] as const;

const BILLING_HOUR_PRESETS = [
  { value: "60", label: "1시간" },
  { value: "120", label: "2시간" },
  { value: "180", label: "3시간" },
  { value: "360", label: "6시간" },
  { value: "720", label: "12시간" },
  { value: "custom", label: "직접입력" },
] as const;

function availableDaysLabel(value: string | null) {
  if (!value) return null;
  return AVAILABLE_DAYS.find((d) => d.value === value)?.label ?? value;
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}시간 ${minutes}분`;
  if (hours) return `${hours}시간`;
  return `${minutes}분`;
}

function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}

function toCommaDisplay(raw: string) {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

function CommaNumberInput({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      value={toCommaDisplay(value)}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
      {...props}
    />
  );
}

export const Route = createFileRoute("/_authenticated/passes")({
  head: () => ({
    meta: [
      { title: "이용권 관리 | 허그앤멍 예약관리" },
      {
        name: "description",
        content: "이용권 상품을 등록하고 횟수·금액·유효기간·사용상태를 관리합니다.",
      },
      { property: "og:title", content: "이용권 관리 | 허그앤멍 예약관리" },
      { property: "og:description", content: "이용권 상품 등록 및 관리" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PassesPage,
});

type PassRow = {
  id: string;
  title: string;
  pass_type: string;
  total_count: number;
  used_count: number;
  price: number;
  purchased_on: string;
  expires_on: string | null;
  memo: string | null;
  active: boolean;
  weight_class: string | null;
  available_days: string | null;
  trip_type: string | null;
  dogs: { id: string; name: string; owners: { name: string; phone: string } | null } | null;
};

function passTypeLabel(type: string) {
  return PASS_TYPE_LABELS[type as PassType] ?? type;
}

function PassesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PassRow | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<PassType | "all">("all");

  const passesQuery = useQuery({
    queryKey: ["passes", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("passes")
        .select(
          "id, title, pass_type, total_count, used_count, price, purchased_on, expires_on, memo, active, weight_class, available_days, trip_type, dogs(id, name, owners(name, phone))",
        )
        .order("purchased_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PassRow[];
    },
  });

  const passes = passesQuery.data ?? [];
  const activeCount = passes.filter((p) => p.active).length;
  const typeCounts = PASS_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = passes.filter((p) => p.pass_type === t).length;
    return acc;
  }, {});
  const filteredPasses = passes.filter((p) => {
    const matchesType = filterType === "all" || p.pass_type === filterType;
    const matchesSearch = p.title.toLowerCase().includes(search.trim().toLowerCase());
    return matchesType && matchesSearch;
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("passes").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passes"] });
    },
    onError: (e: Error) => toast.error("상태 변경에 실패했습니다", { description: e.message }),
  });

  return (
    <AppShell
      title="이용권 관리"
      description="이용권 상품을 등록하고 관리합니다."
      action={<NewPassDialog />}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="surface-card flex items-center gap-4 p-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <Ticket className="size-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">전체 이용권</p>
            <p className="text-2xl font-extrabold">{formatCount(passes.length)}</p>
          </div>
        </div>
        <div className="surface-card flex items-center gap-4 p-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Ticket className="size-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">활성화된 이용권</p>
            <p className="text-2xl font-extrabold">{formatCount(activeCount)}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="상품명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`rounded-full border bg-secondary px-3 py-1.5 text-xs font-bold text-foreground transition-all ${
              filterType === "all"
                ? "border-2 border-primary ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
                : "border-border hover:bg-secondary/70"
            }`}
          >
            전체 {formatCount(passes.length)}
          </button>
          {PASS_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${PASS_TYPE_STYLES[t]} ${
                filterType === t
                  ? "border-2 ring-2 ring-current ring-offset-1 ring-offset-background"
                  : "border opacity-70 hover:opacity-100"
              }`}
            >
              {PASS_TYPE_LABELS[t]} {formatCount(typeCounts[t] ?? 0)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-0 text-[11px] sm:min-w-[900px] sm:text-sm">
            <thead className="bg-secondary/60 text-center text-xs font-bold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">구분</th>
                <th className="px-4 py-3">이용권 이름</th>
                <th className="px-4 py-3">반려견 체중</th>
                <th className="px-4 py-3">과금 기준</th>
                <th className="px-4 py-3">금액</th>
                <th className="px-4 py-3">유효기간</th>
                <th className="px-4 py-3">사용상태</th>
                <th className="hidden px-4 py-3 sm:table-cell">비고</th>
                <th className="px-4 py-3">수정</th>
              </tr>
            </thead>
            <tbody>
              {passesQuery.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    불러오는 중…
                  </td>
                </tr>
              ) : filteredPasses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    조건에 맞는 이용권이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredPasses.map((pass) => {
                  const remaining = Math.max(0, pass.total_count - pass.used_count);
                  const Icon = PASS_TYPE_ICONS[pass.pass_type as PassType] ?? Ticket;
                  return (
                    <tr
                      key={pass.id}
                      className="border-t border-border transition-colors hover:bg-secondary/50"
                    >
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${
                            PASS_TYPE_STYLES[pass.pass_type as PassType] ??
                            "border-border text-muted-foreground"
                          }`}
                        >
                          <Icon className="size-3.5" />
                          {passTypeLabel(pass.pass_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate font-bold">{pass.title}</p>
                        {pass.dogs ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {pass.dogs.name} · {pass.dogs.owners?.name ?? "-"}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {weightClassLabel(pass.weight_class) ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {pass.pass_type === "pickup_dropoff" ? (
                          (tripTypeLabel(pass.trip_type) ?? "-")
                        ) : pass.pass_type === "daily_care" ? (
                          formatDuration(pass.total_count)
                        ) : pass.dogs ? (
                          <>
                            {formatCount(pass.used_count)}/{formatCount(pass.total_count)}회
                            <span className="ml-1 text-[10px]">
                              (잔여 {formatCount(remaining)})
                            </span>
                          </>
                        ) : (
                          `${formatCount(pass.total_count)}회`
                        )}
                        {pass.pass_type === "hotel" && pass.available_days ? (
                          <span className="block text-[10px]">
                            이용가능: {availableDaysLabel(pass.available_days)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {formatWon(pass.price)}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {pass.expires_on ? `~${pass.expires_on}` : "무제한"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={pass.active}
                            onCheckedChange={(v) => toggleActive.mutate({ id: pass.id, active: v })}
                          />
                          <span className="text-xs text-muted-foreground">
                            {pass.active ? "활성화" : "비활성화"}
                          </span>
                        </div>
                      </td>
                      <td className="hidden max-w-[200px] truncate px-4 py-3 text-muted-foreground sm:table-cell">
                        {pass.memo || "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(pass)}
                          aria-label="이용권 수정"
                        >
                          <Pencil className="size-4" />
                          수정
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EditPassDialog row={editing} onOpenChange={(v) => !v && setEditing(null)} />
    </AppShell>
  );
}

const VALIDITY_UNITS = [
  { value: "month", label: "개월" },
  { value: "day", label: "일" },
] as const;

function computeExpiresOn(value: number, unit: "month" | "day"): string | null {
  if (!value || value <= 0) return null;
  const d = new Date();
  if (unit === "month") d.setMonth(d.getMonth() + value);
  else d.setDate(d.getDate() + value);
  return d.toISOString().slice(0, 10);
}

function PassFormFields({
  passType,
  setPassType,
  weightClass,
  setWeightClass,
  availableDays,
  setAvailableDays,
  billingHourPreset,
  setBillingHourPreset,
  dailyCareHour,
  setDailyCareHour,
  tripType,
  setTripType,
  title,
  setTitle,
  totalCount,
  setTotalCount,
  price,
  setPrice,
  validityValue,
  setValidityValue,
  validityUnit,
  setValidityUnit,
  unlimited,
  setUnlimited,
  memo,
  setMemo,
  active,
  setActive,
}: {
  passType: PassType;
  setPassType: (v: PassType) => void;
  weightClass: string;
  setWeightClass: (v: string) => void;
  availableDays: string;
  setAvailableDays: (v: string) => void;
  billingHourPreset: string;
  setBillingHourPreset: (v: string) => void;
  dailyCareHour: string;
  setDailyCareHour: (v: string) => void;
  tripType: string;
  setTripType: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  totalCount: string;
  setTotalCount: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  validityValue: string;
  setValidityValue: (v: string) => void;
  validityUnit: "month" | "day";
  setValidityUnit: (v: "month" | "day") => void;
  unlimited: boolean;
  setUnlimited: (v: boolean) => void;
  memo: string;
  setMemo: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
}) {
  const showWeightClass =
    passType === "kindergarten" || passType === "hotel" || passType === "daily_care";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>이용권 타입</Label>
        <div className="grid grid-cols-5 gap-1.5">
          {PASS_TYPES.map((t) => {
            const Icon = PASS_TYPE_ICONS[t];
            const isActive = passType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setPassType(t);
                  if (t === "daily_care" && billingHourPreset !== "custom") {
                    setTotalCount(billingHourPreset);
                  }
                }}
                className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] font-bold shadow-none transition-all ${
                  isActive
                    ? `${PASS_TYPE_STYLES[t]} scale-[1.03]`
                    : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="size-4" />
                {PASS_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>이용권 이름</Label>
        <Input
          maxLength={40}
          placeholder="예: 유치원 10회권"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {showWeightClass ? (
        <div className="space-y-2">
          <Label>반려견 체중 구분</Label>
          <Select value={weightClass} onValueChange={setWeightClass}>
            <SelectTrigger>
              <SelectValue placeholder="체중 구분을 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {WEIGHT_CLASSES.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {passType === "pickup_dropoff" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>운행구분</Label>
            <div className="grid grid-cols-2 gap-2">
              {TRIP_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTripType(t.value)}
                  className={`rounded-lg border px-2 py-2 text-sm font-bold transition-colors ${
                    tripType === t.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>이용권 금액(원)</Label>
            <CommaNumberInput value={price} onChange={setPrice} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{passType === "daily_care" ? "과금 시간" : "이용권 횟수"}</Label>
            {passType === "daily_care" ? (
              <div className="space-y-2">
                <Select
                  value={billingHourPreset}
                  onValueChange={(v) => {
                    setBillingHourPreset(v);
                    if (v !== "custom") setTotalCount(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_HOUR_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {billingHourPreset === "custom" ? (
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={dailyCareHour}
                      onChange={(e) => {
                        setDailyCareHour(e.target.value);
                        setTotalCount(String(Number(e.target.value || 0) * 60));
                      }}
                      className="pr-8"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      시간
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <CommaNumberInput value={totalCount} onChange={setTotalCount} />
            )}
          </div>
          <div className="space-y-2">
            <Label>{passType === "daily_care" ? "시간당 이용료(원)" : "이용권 금액(원)"}</Label>
            <CommaNumberInput value={price} onChange={setPrice} />
            {passType === "daily_care" ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-bold">
                <span>합계</span>
                <span>{formatWon((Number(totalCount || 0) / 60) * Number(price || 0))}</span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {passType === "hotel" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>이용가능 요일</Label>
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setAvailableDays(d.value)}
                  className={`rounded-lg border px-2 py-2 text-sm font-bold transition-colors ${
                    availableDays === d.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>유효기간</Label>
            <div className="flex items-center gap-2">
              <CommaNumberInput
                value={validityValue}
                onChange={setValidityValue}
                disabled={unlimited}
              />
              <Select
                value={validityUnit}
                onValueChange={(v) => setValidityUnit(v as "month" | "day")}
                disabled={unlimited}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALIDITY_UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-1.5 whitespace-nowrap text-sm font-bold">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={unlimited}
                onChange={(e) => setUnlimited(e.target.checked)}
              />
              무제한
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>유효기간 (발급일로부터)</Label>
          <div className="flex items-center gap-2">
            <div className="grid w-1/2 grid-cols-2 gap-2">
              <CommaNumberInput
                value={validityValue}
                onChange={setValidityValue}
                disabled={unlimited}
              />
              <Select
                value={validityUnit}
                onValueChange={(v) => setValidityUnit(v as "month" | "day")}
                disabled={unlimited}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALIDITY_UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-1.5 whitespace-nowrap text-sm font-bold">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={unlimited}
                onChange={(e) => setUnlimited(e.target.checked)}
              />
              무제한
            </label>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>비고</Label>
        <Textarea
          rows={3}
          placeholder="메모를 입력하세요 (선택)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <Label htmlFor="pass-active" className="cursor-pointer">
          사용상태
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{active ? "활성화" : "비활성화"}</span>
          <Switch id="pass-active" checked={active} onCheckedChange={setActive} />
        </div>
      </div>
    </div>
  );
}

function NewPassDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [passType, setPassType] = useState<PassType>("kindergarten");
  const [weightClass, setWeightClass] = useState("");
  const [availableDays, setAvailableDays] = useState("all");
  const [billingHourPreset, setBillingHourPreset] = useState("60");
  const [dailyCareHour, setDailyCareHour] = useState("0");
  const [tripType, setTripType] = useState("one_way");
  const [title, setTitle] = useState("");
  const [totalCount, setTotalCount] = useState("10");
  const [price, setPrice] = useState("0");
  const [validityValue, setValidityValue] = useState("3");
  const [validityUnit, setValidityUnit] = useState<"month" | "day">("month");
  const [unlimited, setUnlimited] = useState(false);
  const [memo, setMemo] = useState("");
  const [active, setActive] = useState(true);

  function reset() {
    setPassType("kindergarten");
    setWeightClass("");
    setAvailableDays("all");
    setBillingHourPreset("60");
    setDailyCareHour("0");
    setTripType("one_way");
    setTitle("");
    setTotalCount("10");
    setPrice("0");
    setValidityValue("3");
    setValidityUnit("month");
    setUnlimited(false);
    setMemo("");
    setActive(true);
  }

  const create = useMutation({
    mutationFn: async () => {
      const isPickupDropoff = passType === "pickup_dropoff";
      const isDailyCare = passType === "daily_care";
      const expiresOn = unlimited ? null : computeExpiresOn(Number(validityValue), validityUnit);
      const finalPrice = isDailyCare
        ? Math.round((Number(totalCount || 0) / 60) * Number(price || 0))
        : Number(price);
      const { error } = await supabase.from("passes").insert({
        pass_type: passType,
        weight_class:
          passType === "kindergarten" || passType === "hotel" || passType === "daily_care"
            ? weightClass || null
            : null,
        available_days: passType === "hotel" ? availableDays || null : null,
        trip_type: isPickupDropoff ? tripType || null : null,
        title: title.trim(),
        total_count: isPickupDropoff ? 1 : Number(totalCount),
        price: finalPrice,
        expires_on: expiresOn,
        memo: memo.trim() || null,
        active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passes"] });
      toast.success("이용권을 등록했습니다");
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error("등록에 실패했습니다", { description: e.message }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> 이용권 등록
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이용권 등록</DialogTitle>
          <DialogDescription>새로운 이용권 상품을 등록합니다.</DialogDescription>
        </DialogHeader>
        <PassFormFields
          passType={passType}
          setPassType={setPassType}
          weightClass={weightClass}
          setWeightClass={setWeightClass}
          availableDays={availableDays}
          setAvailableDays={setAvailableDays}
          billingHourPreset={billingHourPreset}
          setBillingHourPreset={setBillingHourPreset}
          dailyCareHour={dailyCareHour}
          setDailyCareHour={setDailyCareHour}
          tripType={tripType}
          setTripType={setTripType}
          title={title}
          setTitle={setTitle}
          totalCount={totalCount}
          setTotalCount={setTotalCount}
          price={price}
          setPrice={setPrice}
          validityValue={validityValue}
          setValidityValue={setValidityValue}
          validityUnit={validityUnit}
          setValidityUnit={setValidityUnit}
          unlimited={unlimited}
          setUnlimited={setUnlimited}
          memo={memo}
          setMemo={setMemo}
          active={active}
          setActive={setActive}
        />
        <DialogFooter>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            등록하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPassDialog({
  row,
  onOpenChange,
}: {
  row: PassRow | null;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [passType, setPassType] = useState<PassType>("kindergarten");
  const [weightClass, setWeightClass] = useState("");
  const [availableDays, setAvailableDays] = useState("all");
  const [billingHourPreset, setBillingHourPreset] = useState("60");
  const [dailyCareHour, setDailyCareHour] = useState("0");
  const [tripType, setTripType] = useState("one_way");
  const [title, setTitle] = useState("");
  const [totalCount, setTotalCount] = useState("10");
  const [price, setPrice] = useState("0");
  const [validityValue, setValidityValue] = useState("0");
  const [validityUnit, setValidityUnit] = useState<"month" | "day">("month");
  const [unlimited, setUnlimited] = useState(false);
  const [memo, setMemo] = useState("");
  const [active, setActive] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const open = row !== null;

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (row && loadedFor !== row.id) {
    setLoadedFor(row.id);
    setPassType((row.pass_type as PassType) ?? "kindergarten");
    setWeightClass(row.weight_class ?? "");
    setAvailableDays(row.available_days ?? "all");
    setBillingHourPreset(
      BILLING_HOUR_PRESETS.some((p) => p.value === String(row.total_count))
        ? String(row.total_count)
        : "custom",
    );
    setDailyCareHour(String(Math.floor(row.total_count / 60)));
    setTripType(row.trip_type ?? "one_way");
    setTitle(row.title);
    setTotalCount(String(row.total_count));
    setPrice(
      row.pass_type === "daily_care" && row.total_count > 0
        ? String(Math.round((row.price / row.total_count) * 60))
        : String(row.price),
    );
    setValidityValue("0");
    setValidityUnit("month");
    setUnlimited(!row.expires_on);
    setMemo(row.memo ?? "");
    setActive(row.active);
  }

  const update = useMutation({
    mutationFn: async () => {
      const isPickupDropoff = passType === "pickup_dropoff";
      const isDailyCare = passType === "daily_care";
      const newExpiresOn = unlimited ? null : computeExpiresOn(Number(validityValue), validityUnit);
      const finalPrice = isDailyCare
        ? Math.round((Number(totalCount || 0) / 60) * Number(price || 0))
        : Number(price);
      const { error } = await supabase
        .from("passes")
        .update({
          pass_type: passType,
          weight_class:
            passType === "kindergarten" || passType === "hotel" || passType === "daily_care"
              ? weightClass || null
              : null,
          available_days: passType === "hotel" ? availableDays || null : null,
          trip_type: isPickupDropoff ? tripType || null : null,
          title: title.trim(),
          total_count: isPickupDropoff ? 1 : Number(totalCount),
          price: finalPrice,
          memo: memo.trim() || null,
          active,
          ...(unlimited || newExpiresOn ? { expires_on: newExpiresOn } : {}),
        })
        .eq("id", row!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passes"] });
      toast.success("이용권 정보가 수정되었습니다.");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("수정에 실패했습니다", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("passes").delete().eq("id", row!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passes"] });
      toast.success("이용권이 삭제되었습니다.");
      setConfirmDeleteOpen(false);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("삭제에 실패했습니다", { description: e.message }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이용권 수정</DialogTitle>
            <DialogDescription>
              유효기간은 오늘 날짜 기준으로 다시 계산됩니다. 값을 변경하지 않으려면 0으로 두고,
              무제한으로 바꾸려면 체크박스를 선택하세요.
            </DialogDescription>
          </DialogHeader>
          <PassFormFields
            passType={passType}
            setPassType={setPassType}
            weightClass={weightClass}
            setWeightClass={setWeightClass}
            availableDays={availableDays}
            setAvailableDays={setAvailableDays}
            billingHourPreset={billingHourPreset}
            setBillingHourPreset={setBillingHourPreset}
            dailyCareHour={dailyCareHour}
            setDailyCareHour={setDailyCareHour}
            tripType={tripType}
            setTripType={setTripType}
            title={title}
            setTitle={setTitle}
            totalCount={totalCount}
            setTotalCount={setTotalCount}
            price={price}
            setPrice={setPrice}
            validityValue={validityValue}
            setValidityValue={setValidityValue}
            validityUnit={validityUnit}
            setValidityUnit={setValidityUnit}
            unlimited={unlimited}
            setUnlimited={setUnlimited}
            memo={memo}
            setMemo={setMemo}
            active={active}
            setActive={setActive}
          />
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={remove.isPending}
            >
              삭제
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button disabled={!title.trim() || update.isPending} onClick={() => update.mutate()}>
                {update.isPending ? "저장 중…" : "저장"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이용권을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {row?.title} 이용권이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
              disabled={remove.isPending}
            >
              {remove.isPending ? "삭제 중…" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
