import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ComponentProps, type ReactNode } from "react";
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
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { MobileSubTabLink } from "@/components/MobileSubTabs";
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
import { SERVICE_TYPES, formatWon, type ServiceType } from "@/lib/kindergarten";

type PassType = ServiceType | "pickup_dropoff" | "balance";

const PASS_TYPES: PassType[] = [...SERVICE_TYPES, "pickup_dropoff", "balance"];

/** 이용권 등록 폼 전용 상품 구분 명칭 (예약 시스템의 SERVICE_LABELS와 별개) */
const PASS_TYPE_LABELS: Record<PassType, string> = {
  kindergarten: "유치원 이용권",
  hotel: "호텔 이용권",
  daily_care: "데이케어",
  grooming: "미용 기본",
  pickup_dropoff: "픽드랍",
  balance: "금액권",
};

const PASS_TYPE_STYLES: Record<PassType, string> = {
  kindergarten: "bg-primary/12 text-primary border-primary/25",
  hotel: "bg-accent/20 text-accent-foreground/70 border-accent/35",
  daily_care: "bg-rose-300/10 text-rose-400/80 border-rose-300/45",
  grooming: "bg-warning/20 text-warning-foreground/70 border-warning/35",
  pickup_dropoff: "bg-gray-300/15 text-gray-500/90 border-gray-300/45",
  balance: "bg-amber-800/10 text-amber-800/80 border-amber-800/30",
};

const PASS_TYPE_ICONS: Record<PassType, typeof CalendarCheck> = {
  kindergarten: CalendarCheck,
  hotel: BedDouble,
  daily_care: Clock,
  grooming: Scissors,
  pickup_dropoff: Car,
  balance: Wallet,
};

const PASS_TYPE_HELP: Record<PassType, string> = {
  kindergarten: "횟수·가격·유효기간을 자유롭게 설정",
  hotel: "상품명과 금액을 자유롭게 설정",
  daily_care: "30분 또는 1시간 단위",
  pickup_dropoff: "편도 또는 왕복 상품",
  grooming: "정액 또는 kg당 기본 시술",
  balance: "체중·횟수 구분 없이 충전금액만 설정",
};

const PASS_NAME_PLACEHOLDER: Record<PassType, string> = {
  kindergarten: "예: 주 2회 10회권",
  hotel: "예: 주말 호텔 이용권",
  daily_care: "예: 주 2회 10회권",
  pickup_dropoff: "예: 주 2회 10회권",
  grooming: "예: 주 2회 10회권",
  balance: "예: 충전 금액권 10만원",
};

const TRIP_TYPES = [
  { value: "one_way", label: "편도" },
  { value: "round_trip", label: "왕복" },
] as const;

function tripTypeLabel(value: string | null) {
  if (!value) return null;
  return TRIP_TYPES.find((t) => t.value === value)?.label ?? value;
}

const GROOMING_PRICING = [
  { value: "flat", label: "1회 정액" },
  { value: "per_kg", label: "kg당" },
] as const;

function pricingBasisLabel(value: string | null) {
  if (!value) return null;
  return GROOMING_PRICING.find((p) => p.value === value)?.label ?? value;
}

const WEIGHT_CLASSES = [
  { value: "small", label: "소형" },
  { value: "small_medium", label: "중소형" },
  { value: "medium", label: "중형" },
  { value: "medium_large", label: "중대형" },
  { value: "large", label: "대형" },
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

function availableDaysLabel(value: string | null) {
  if (!value) return null;
  return AVAILABLE_DAYS.find((d) => d.value === value)?.label ?? value;
}

const DAILY_CARE_UNITS = [
  { value: "30", label: "30분" },
  { value: "60", label: "1시간" },
] as const;

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
      { title: "이용권 설정 | 허그앤멍 예약관리" },
      {
        name: "description",
        content: "이용권 상품을 등록하고 횟수·금액·유효기간·사용상태를 관리합니다.",
      },
      { property: "og:title", content: "이용권 설정 | 허그앤멍 예약관리" },
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
  pricing_basis: string | null;
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
          "id, title, pass_type, total_count, used_count, price, purchased_on, expires_on, memo, active, weight_class, available_days, trip_type, pricing_basis, dogs(id, name, owners(name, phone))",
        )
        .is("dog_id", null)
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
      title="이용권 설정"
      description="이용권 상품을 등록하고 관리합니다."
      action={<NewPassDialog />}
      hideTitleOnMobile
      mobileSubTabs={
        <>
          <MobileSubTabLink to="/passes" active>
            이용권 설정
          </MobileSubTabLink>
          <MobileSubTabLink to="/passes-usage" active={false}>
            이용권 사용현황
          </MobileSubTabLink>
        </>
      }
    >
      <div className="mb-6 hidden gap-4 sm:grid sm:grid-cols-2">
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

      {/* 모바일 전용 FAB: 이용권 등록 */}
      <NewPassDialog
        trigger={
          <button
            type="button"
            className="fixed bottom-24 right-5 z-40 flex items-center gap-1.5 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-transform active:scale-95 sm:hidden"
          >
            <Plus className="size-4" />
            이용권 등록
          </button>
        }
      />

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

      {/* 모바일: 카드 UI */}
      <div className="space-y-3 sm:hidden">
        {passesQuery.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : filteredPasses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            조건에 맞는 이용권이 없습니다.
          </p>
        ) : (
          filteredPasses.map((pass) => {
            const remaining = Math.max(0, pass.total_count - pass.used_count);
            const Icon = PASS_TYPE_ICONS[pass.pass_type as PassType] ?? Ticket;
            return (
              <div key={pass.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      PASS_TYPE_STYLES[pass.pass_type as PassType] ??
                      "border-border text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-3" />
                    {passTypeLabel(pass.pass_type)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={pass.active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: pass.id, active: v })}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {pass.active ? "활성화" : "비활성화"}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 truncate text-sm font-bold">{pass.title}</p>
                {pass.dogs ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {pass.dogs.name} · {pass.dogs.owners?.name ?? "-"}
                  </p>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-y-1.5 border-t border-border/60 pt-2 text-xs">
                  <span className="text-muted-foreground">반려견 체중</span>
                  <span className="text-right font-semibold">
                    {weightClassLabel(pass.weight_class) ?? "-"}
                  </span>
                  <span className="text-muted-foreground">과금 기준</span>
                  <span className="text-right font-semibold">
                    {pass.pass_type === "balance" ? (
                      pass.dogs ? (
                        `잔여 ${formatWon(remaining)}`
                      ) : (
                        `충전 ${formatWon(pass.total_count)}`
                      )
                    ) : pass.dogs ? (
                      <>
                        {formatCount(pass.used_count)}/{formatCount(pass.total_count)}회 (잔여{" "}
                        {formatCount(remaining)})
                      </>
                    ) : pass.pass_type === "pickup_dropoff" ? (
                      (tripTypeLabel(pass.trip_type) ?? "-")
                    ) : pass.pass_type === "daily_care" ? (
                      formatDuration(pass.total_count)
                    ) : pass.pass_type === "kindergarten" ? (
                      `${formatCount(pass.total_count)}회`
                    ) : pass.pass_type === "grooming" ? (
                      (pricingBasisLabel(pass.pricing_basis) ?? "-")
                    ) : (
                      "-"
                    )}
                  </span>
                  <span className="text-muted-foreground">금액</span>
                  <span className="text-right font-semibold">{formatWon(pass.price)}</span>
                  <span className="text-muted-foreground">유효기간</span>
                  <span className="text-right font-semibold">
                    {pass.expires_on ? `~${pass.expires_on}` : "무제한"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setEditing(pass)}
                >
                  <Pencil className="size-3.5" />
                  수정
                </Button>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border bg-card sm:block">
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
                        {pass.pass_type === "balance" ? (
                          pass.dogs ? (
                            <>잔여 {formatWon(remaining)}</>
                          ) : (
                            <>충전 {formatWon(pass.total_count)}</>
                          )
                        ) : pass.dogs ? (
                          <>
                            {formatCount(pass.used_count)}/{formatCount(pass.total_count)}회
                            <span className="ml-1 text-[10px]">
                              (잔여 {formatCount(remaining)})
                            </span>
                          </>
                        ) : pass.pass_type === "pickup_dropoff" ? (
                          (tripTypeLabel(pass.trip_type) ?? "-")
                        ) : pass.pass_type === "daily_care" ? (
                          formatDuration(pass.total_count)
                        ) : pass.pass_type === "kindergarten" ? (
                          `${formatCount(pass.total_count)}회`
                        ) : pass.pass_type === "grooming" ? (
                          (pricingBasisLabel(pass.pricing_basis) ?? "-")
                        ) : (
                          "-"
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
  title,
  setTitle,
  weightClass,
  setWeightClass,
  totalCount,
  setTotalCount,
  price,
  setPrice,
  validityValue,
  setValidityValue,
  validityUnit,
  setValidityUnit,
  dailyCareUnit,
  setDailyCareUnit,
  tripType,
  setTripType,
  pricingBasis,
  setPricingBasis,
  memo,
  setMemo,
  active,
  setActive,
}: {
  passType: PassType;
  setPassType: (v: PassType) => void;
  title: string;
  setTitle: (v: string) => void;
  weightClass: string;
  setWeightClass: (v: string) => void;
  totalCount: string;
  setTotalCount: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  validityValue: string;
  setValidityValue: (v: string) => void;
  validityUnit: "month" | "day";
  setValidityUnit: (v: "month" | "day") => void;
  dailyCareUnit: string;
  setDailyCareUnit: (v: string) => void;
  tripType: string;
  setTripType: (v: string) => void;
  pricingBasis: string;
  setPricingBasis: (v: string) => void;
  memo: string;
  setMemo: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
}) {
  const perUsePrice =
    passType === "kindergarten" && Number(totalCount) > 0
      ? Math.round(Number(price || 0) / Number(totalCount))
      : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>
          상품 구분 <span className="text-destructive">*</span>
        </Label>
        <Select value={passType} onValueChange={(v) => setPassType(v as PassType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PASS_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {PASS_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{PASS_TYPE_HELP[passType]}</p>
      </div>

      <div className="space-y-2">
        <Label>
          상품명 <span className="text-destructive">*</span>
        </Label>
        <Input
          maxLength={40}
          placeholder={PASS_NAME_PLACEHOLDER[passType]}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {passType !== "balance" ? (
        <div className="space-y-2">
          <Label>
            반려견 체중 구분 <span className="text-destructive">*</span>
          </Label>
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

      {passType === "balance" ? (
        <div className="space-y-2">
          <Label>
            충전금액 <span className="text-destructive">*</span>
          </Label>
          <CommaNumberInput value={price} onChange={setPrice} />
        </div>
      ) : passType === "kindergarten" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>
                제공 횟수 <span className="text-destructive">*</span>
              </Label>
              <CommaNumberInput value={totalCount} onChange={setTotalCount} />
            </div>
            <div className="space-y-2">
              <Label>
                판매금액 <span className="text-destructive">*</span>
              </Label>
              <CommaNumberInput value={price} onChange={setPrice} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>
                유효기간 기준 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={validityUnit}
                onValueChange={(v) => setValidityUnit(v as "month" | "day")}
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
            <div className="space-y-2">
              <Label>
                유효기간 <span className="text-destructive">*</span>
              </Label>
              <CommaNumberInput value={validityValue} onChange={setValidityValue} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-sm">
            회당 기준금액 <span className="font-bold text-primary">{formatWon(perUsePrice)}</span>
          </div>
        </>
      ) : passType === "hotel" ? (
        <div className="space-y-2">
          <Label>
            이용권 금액 <span className="text-destructive">*</span>
          </Label>
          <CommaNumberInput value={price} onChange={setPrice} />
        </div>
      ) : passType === "daily_care" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>
              과금 시간 단위 <span className="text-destructive">*</span>
            </Label>
            <Select value={dailyCareUnit} onValueChange={setDailyCareUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAILY_CARE_UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              단위 금액 <span className="text-destructive">*</span>
            </Label>
            <CommaNumberInput value={price} onChange={setPrice} />
          </div>
        </div>
      ) : passType === "pickup_dropoff" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>
              운행 구분 <span className="text-destructive">*</span>
            </Label>
            <Select value={tripType} onValueChange={setTripType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIP_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              금액 <span className="text-destructive">*</span>
            </Label>
            <CommaNumberInput value={price} onChange={setPrice} />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>
                가격 방식 <span className="text-destructive">*</span>
              </Label>
              <Select value={pricingBasis} onValueChange={setPricingBasis}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROOMING_PRICING.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                금액 <span className="text-destructive">*</span>
              </Label>
              <CommaNumberInput value={price} onChange={setPrice} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            kg당을 선택해도 상품은 체중으로 자동 선택되지 않습니다.
          </p>
        </>
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

function NewPassDialog({ trigger }: { trigger?: ReactNode }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [passType, setPassType] = useState<PassType>("kindergarten");
  const [title, setTitle] = useState("");
  const [weightClass, setWeightClass] = useState("small");
  const [totalCount, setTotalCount] = useState("10");
  const [price, setPrice] = useState("0");
  const [validityValue, setValidityValue] = useState("3");
  const [validityUnit, setValidityUnit] = useState<"month" | "day">("month");
  const [dailyCareUnit, setDailyCareUnit] = useState("60");
  const [tripType, setTripType] = useState("one_way");
  const [pricingBasis, setPricingBasis] = useState("flat");
  const [memo, setMemo] = useState("");
  const [active, setActive] = useState(true);

  function reset() {
    setPassType("kindergarten");
    setTitle("");
    setWeightClass("small");
    setTotalCount("10");
    setPrice("0");
    setValidityValue("3");
    setValidityUnit("month");
    setDailyCareUnit("60");
    setTripType("one_way");
    setPricingBasis("flat");
    setMemo("");
    setActive(true);
  }

  const create = useMutation({
    mutationFn: async () => {
      const isKindergarten = passType === "kindergarten";
      const isDailyCare = passType === "daily_care";
      const isPickupDropoff = passType === "pickup_dropoff";
      const isGrooming = passType === "grooming";
      const isBalance = passType === "balance";
      const expiresOn = isKindergarten
        ? computeExpiresOn(Number(validityValue), validityUnit)
        : null;
      const { error } = await supabase.from("passes").insert({
        pass_type: passType,
        title: title.trim(),
        total_count: isBalance
          ? Number(price)
          : isKindergarten
            ? Number(totalCount)
            : isDailyCare
              ? Number(dailyCareUnit)
              : 1,
        price: Number(price),
        trip_type: isPickupDropoff ? tripType || null : null,
        pricing_basis: isGrooming ? pricingBasis || null : null,
        weight_class: isBalance ? null : weightClass || null,
        available_days: null,
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
        {trigger ?? (
          <Button>
            <Plus className="size-4" /> 이용권 등록
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이용권 등록</DialogTitle>
        </DialogHeader>
        <PassFormFields
          passType={passType}
          setPassType={setPassType}
          title={title}
          setTitle={setTitle}
          weightClass={weightClass}
          setWeightClass={setWeightClass}
          totalCount={totalCount}
          setTotalCount={setTotalCount}
          price={price}
          setPrice={setPrice}
          validityValue={validityValue}
          setValidityValue={setValidityValue}
          validityUnit={validityUnit}
          setValidityUnit={setValidityUnit}
          dailyCareUnit={dailyCareUnit}
          setDailyCareUnit={setDailyCareUnit}
          tripType={tripType}
          setTripType={setTripType}
          pricingBasis={pricingBasis}
          setPricingBasis={setPricingBasis}
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
  const [title, setTitle] = useState("");
  const [weightClass, setWeightClass] = useState("small");
  const [totalCount, setTotalCount] = useState("10");
  const [price, setPrice] = useState("0");
  const [validityValue, setValidityValue] = useState("0");
  const [validityUnit, setValidityUnit] = useState<"month" | "day">("month");
  const [dailyCareUnit, setDailyCareUnit] = useState("60");
  const [tripType, setTripType] = useState("one_way");
  const [pricingBasis, setPricingBasis] = useState("flat");
  const [memo, setMemo] = useState("");
  const [active, setActive] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const open = row !== null;

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (row && loadedFor !== row.id) {
    setLoadedFor(row.id);
    setPassType((row.pass_type as PassType) ?? "kindergarten");
    setTitle(row.title);
    setWeightClass(row.weight_class ?? "small");
    setTotalCount(String(row.total_count));
    setPrice(String(row.price));
    setValidityValue("0");
    setValidityUnit("month");
    setDailyCareUnit(
      DAILY_CARE_UNITS.some((u) => u.value === String(row.total_count))
        ? String(row.total_count)
        : "60",
    );
    setTripType(row.trip_type ?? "one_way");
    setPricingBasis(row.pricing_basis ?? "flat");
    setMemo(row.memo ?? "");
    setActive(row.active);
  }

  const update = useMutation({
    mutationFn: async () => {
      const isKindergarten = passType === "kindergarten";
      const isDailyCare = passType === "daily_care";
      const isPickupDropoff = passType === "pickup_dropoff";
      const isGrooming = passType === "grooming";
      const isBalance = passType === "balance";
      const newExpiresOn = isKindergarten
        ? computeExpiresOn(Number(validityValue), validityUnit)
        : null;
      const { error } = await supabase
        .from("passes")
        .update({
          pass_type: passType,
          title: title.trim(),
          total_count: isBalance
            ? Number(price)
            : isKindergarten
              ? Number(totalCount)
              : isDailyCare
                ? Number(dailyCareUnit)
                : 1,
          price: Number(price),
          trip_type: isPickupDropoff ? tripType || null : null,
          pricing_basis: isGrooming ? pricingBasis || null : null,
          weight_class: isBalance ? null : weightClass || null,
          available_days: null,
          memo: memo.trim() || null,
          active,
          ...(isKindergarten && newExpiresOn ? { expires_on: newExpiresOn } : {}),
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
          </DialogHeader>
          <PassFormFields
            passType={passType}
            setPassType={setPassType}
            title={title}
            setTitle={setTitle}
            weightClass={weightClass}
            setWeightClass={setWeightClass}
            totalCount={totalCount}
            setTotalCount={setTotalCount}
            price={price}
            setPrice={setPrice}
            validityValue={validityValue}
            setValidityValue={setValidityValue}
            validityUnit={validityUnit}
            setValidityUnit={setValidityUnit}
            dailyCareUnit={dailyCareUnit}
            setDailyCareUnit={setDailyCareUnit}
            tripType={tripType}
            setTripType={setTripType}
            pricingBasis={pricingBasis}
            setPricingBasis={setPricingBasis}
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
