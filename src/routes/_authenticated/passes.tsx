import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BedDouble, CalendarCheck, Clock, Pencil, Plus, Scissors, Ticket } from "lucide-react";
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

const SERVICE_ICONS: Record<ServiceType, typeof CalendarCheck> = {
  kindergarten: CalendarCheck,
  hotel: BedDouble,
  daily_care: Clock,
  grooming: Scissors,
};

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
  { value: "1", label: "1시간" },
  { value: "2", label: "2시간" },
  { value: "3", label: "3시간" },
  { value: "6", label: "6시간" },
  { value: "12", label: "12시간" },
  { value: "custom", label: "직접입력" },
] as const;

function availableDaysLabel(value: string | null) {
  if (!value) return null;
  return AVAILABLE_DAYS.find((d) => d.value === value)?.label ?? value;
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
  dogs: { id: string; name: string; owners: { name: string; phone: string } | null } | null;
};

function passTypeLabel(type: string) {
  return SERVICE_LABELS[type as ServiceType] ?? type;
}

function PassesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PassRow | null>(null);

  const passesQuery = useQuery({
    queryKey: ["passes", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("passes")
        .select(
          "id, title, pass_type, total_count, used_count, price, purchased_on, expires_on, memo, active, weight_class, available_days, dogs(id, name, owners(name, phone))",
        )
        .order("purchased_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PassRow[];
    },
  });

  const passes = passesQuery.data ?? [];
  const activeCount = passes.filter((p) => p.active).length;

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
            <p className="text-2xl font-extrabold">{passes.length}</p>
          </div>
        </div>
        <div className="surface-card flex items-center gap-4 p-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Ticket className="size-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">활성화된 이용권</p>
            <p className="text-2xl font-extrabold">{activeCount}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-0 text-[11px] sm:min-w-[820px] sm:text-sm">
            <thead className="bg-secondary/60 text-center text-xs font-bold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">이용권</th>
                <th className="px-4 py-3">타입</th>
                <th className="px-4 py-3">횟수</th>
                <th className="px-4 py-3">금액</th>
                <th className="px-4 py-3">유효기간</th>
                <th className="hidden px-4 py-3 sm:table-cell">비고</th>
                <th className="px-4 py-3">사용상태</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {passesQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    불러오는 중…
                  </td>
                </tr>
              ) : passes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    등록된 이용권이 없습니다. &ldquo;이용권 등록&rdquo;으로 상품을 만들어 보세요.
                  </td>
                </tr>
              ) : (
                passes.map((pass) => {
                  const remaining = Math.max(0, pass.total_count - pass.used_count);
                  return (
                    <tr
                      key={pass.id}
                      className="border-t border-border transition-colors hover:bg-secondary/50"
                    >
                      <td className="px-4 py-3">
                        <p className="truncate font-bold">{pass.title}</p>
                        {pass.dogs ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {pass.dogs.name} · {pass.dogs.owners?.name ?? "-"}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {passTypeLabel(pass.pass_type)}
                        {pass.pass_type === "kindergarten" && pass.weight_class ? (
                          <span className="block text-[10px]">
                            {weightClassLabel(pass.weight_class)}
                          </span>
                        ) : null}
                        {pass.pass_type === "hotel" && pass.available_days ? (
                          <span className="block text-[10px]">
                            이용가능: {availableDaysLabel(pass.available_days)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {pass.pass_type === "daily_care" ? (
                          `${pass.total_count}시간`
                        ) : (
                          <>
                            {pass.used_count}/{pass.total_count}회
                            <span className="ml-1 text-[10px]">(잔여 {remaining})</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {formatWon(pass.price)}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {pass.expires_on ? `~${pass.expires_on}` : "무제한"}
                      </td>
                      <td className="hidden max-w-[200px] truncate px-4 py-3 text-muted-foreground sm:table-cell">
                        {pass.memo || "-"}
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
                      <td className="px-4 py-3 text-right">
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
  memo,
  setMemo,
  active,
  setActive,
}: {
  passType: ServiceType;
  setPassType: (v: ServiceType) => void;
  weightClass: string;
  setWeightClass: (v: string) => void;
  availableDays: string;
  setAvailableDays: (v: string) => void;
  billingHourPreset: string;
  setBillingHourPreset: (v: string) => void;
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
  memo: string;
  setMemo: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>이용권 타입</Label>
        <div className="grid grid-cols-4 gap-2">
          {SERVICE_TYPES.map((t) => {
            const Icon = SERVICE_ICONS[t];
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
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-bold shadow-none transition-all ${
                  isActive
                    ? `${SERVICE_STYLES[t]} scale-[1.03]`
                    : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="size-5" />
                {SERVICE_LABELS[t]}
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

      {passType === "kindergarten" ? (
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
                <Input
                  type="number"
                  min="1"
                  placeholder="시간을 직접 입력하세요"
                  value={totalCount}
                  onChange={(e) => setTotalCount(e.target.value)}
                />
              ) : null}
            </div>
          ) : (
            <Input
              type="number"
              min="1"
              value={totalCount}
              onChange={(e) => setTotalCount(e.target.value)}
            />
          )}
        </div>
        <div className="space-y-2">
          <Label>이용권 금액 (원)</Label>
          <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>

      {passType === "hotel" ? (
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
      ) : null}

      <div className="space-y-2">
        <Label>유효기간 (발급일로부터)</Label>
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            min="0"
            value={validityValue}
            onChange={(e) => setValidityValue(e.target.value)}
          />
          <Select value={validityUnit} onValueChange={(v) => setValidityUnit(v as "month" | "day")}>
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
        <p className="text-xs text-muted-foreground">
          0으로 두면 만료일 없이 무제한으로 등록됩니다.
        </p>
      </div>

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
  const [passType, setPassType] = useState<ServiceType>("kindergarten");
  const [weightClass, setWeightClass] = useState("");
  const [availableDays, setAvailableDays] = useState("all");
  const [billingHourPreset, setBillingHourPreset] = useState("1");
  const [title, setTitle] = useState("");
  const [totalCount, setTotalCount] = useState("10");
  const [price, setPrice] = useState("300000");
  const [validityValue, setValidityValue] = useState("3");
  const [validityUnit, setValidityUnit] = useState<"month" | "day">("month");
  const [memo, setMemo] = useState("");
  const [active, setActive] = useState(true);

  function reset() {
    setPassType("kindergarten");
    setWeightClass("");
    setAvailableDays("all");
    setBillingHourPreset("1");
    setTitle("");
    setTotalCount("10");
    setPrice("300000");
    setValidityValue("3");
    setValidityUnit("month");
    setMemo("");
    setActive(true);
  }

  const create = useMutation({
    mutationFn: async () => {
      const expiresOn = computeExpiresOn(Number(validityValue), validityUnit);
      const { error } = await supabase.from("passes").insert({
        pass_type: passType,
        weight_class: passType === "kindergarten" ? weightClass || null : null,
        available_days: passType === "hotel" ? availableDays || null : null,
        title: title.trim(),
        total_count: Number(totalCount),
        price: Number(price),
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
  const [passType, setPassType] = useState<ServiceType>("kindergarten");
  const [weightClass, setWeightClass] = useState("");
  const [availableDays, setAvailableDays] = useState("all");
  const [billingHourPreset, setBillingHourPreset] = useState("1");
  const [title, setTitle] = useState("");
  const [totalCount, setTotalCount] = useState("10");
  const [price, setPrice] = useState("0");
  const [validityValue, setValidityValue] = useState("0");
  const [validityUnit, setValidityUnit] = useState<"month" | "day">("month");
  const [memo, setMemo] = useState("");
  const [active, setActive] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const open = row !== null;

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (row && loadedFor !== row.id) {
    setLoadedFor(row.id);
    setPassType((row.pass_type as ServiceType) ?? "kindergarten");
    setWeightClass(row.weight_class ?? "");
    setAvailableDays(row.available_days ?? "all");
    setBillingHourPreset(
      BILLING_HOUR_PRESETS.some((p) => p.value === String(row.total_count))
        ? String(row.total_count)
        : "custom",
    );
    setTitle(row.title);
    setTotalCount(String(row.total_count));
    setPrice(String(row.price));
    setValidityValue("0");
    setValidityUnit("month");
    setMemo(row.memo ?? "");
    setActive(row.active);
  }

  const update = useMutation({
    mutationFn: async () => {
      const newExpiresOn = computeExpiresOn(Number(validityValue), validityUnit);
      const { error } = await supabase
        .from("passes")
        .update({
          pass_type: passType,
          weight_class: passType === "kindergarten" ? weightClass || null : null,
          available_days: passType === "hotel" ? availableDays || null : null,
          title: title.trim(),
          total_count: Number(totalCount),
          price: Number(price),
          memo: memo.trim() || null,
          active,
          ...(newExpiresOn ? { expires_on: newExpiresOn } : {}),
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
              유효기간은 오늘 날짜 기준으로 다시 계산됩니다. 변경하지 않으려면 0으로 두세요.
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
