import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CreditCard, Plus, Ticket } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  PAYMENT_LABELS,
  SERVICE_LABELS,
  SERVICE_TYPES,
  formatWon,
  type ServiceType,
} from "@/lib/kindergarten";

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
  payment_status: string;
  purchased_on: string;
  expires_on: string | null;
  memo: string | null;
  active: boolean;
  dogs: { id: string; name: string; owners: { name: string; phone: string } | null } | null;
};

function passTypeLabel(type: string) {
  return SERVICE_LABELS[type as ServiceType] ?? type;
}

function PassesPage() {
  const queryClient = useQueryClient();

  const passesQuery = useQuery({
    queryKey: ["passes", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("passes")
        .select(
          "id, title, pass_type, total_count, used_count, price, payment_status, purchased_on, expires_on, memo, active, dogs(id, name, owners(name, phone))",
        )
        .order("purchased_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PassRow[];
    },
  });

  const passes = passesQuery.data ?? [];
  const activeCount = passes.filter((p) => p.active).length;
  const revenue = passes
    .filter((p) => p.payment_status === "paid")
    .reduce((sum, p) => sum + p.price, 0);

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("passes")
        .update({ payment_status: "paid", paid_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passes"] });
      toast.success("결제 완료로 변경했습니다");
    },
    onError: (e: Error) => toast.error("변경에 실패했습니다", { description: e.message }),
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
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
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
        <div className="surface-card flex items-center gap-4 border-accent/40 p-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/25 text-accent-foreground">
            <CreditCard className="size-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">결제 완료 합계</p>
            <p className="text-2xl font-extrabold">{formatWon(revenue)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-0 text-[11px] sm:min-w-[900px] sm:text-sm">
            <thead className="bg-secondary/60 text-center text-xs font-bold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">이용권</th>
                <th className="px-4 py-3">타입</th>
                <th className="px-4 py-3">횟수</th>
                <th className="px-4 py-3">금액</th>
                <th className="px-4 py-3">유효기간</th>
                <th className="hidden px-4 py-3 sm:table-cell">비고</th>
                <th className="px-4 py-3">결제</th>
                <th className="px-4 py-3">사용상태</th>
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
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {pass.used_count}/{pass.total_count}회
                        <span className="ml-1 text-[10px]">(잔여 {remaining})</span>
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
                      <td className="px-4 py-3 text-center">
                        {pass.payment_status === "unpaid" && pass.dogs ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markPaid.mutate(pass.id)}
                          >
                            결제 완료 처리
                          </Button>
                        ) : (
                          <Badge
                            className={
                              pass.payment_status === "paid"
                                ? "bg-primary text-primary-foreground"
                                : pass.payment_status === "refunded"
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-accent/30 text-accent-foreground"
                            }
                          >
                            {PAYMENT_LABELS[pass.payment_status] ?? pass.payment_status}
                          </Badge>
                        )}
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
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

function NewPassDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [passType, setPassType] = useState<ServiceType>("kindergarten");
  const [title, setTitle] = useState("");
  const [totalCount, setTotalCount] = useState("10");
  const [price, setPrice] = useState("300000");
  const [validityValue, setValidityValue] = useState("3");
  const [validityUnit, setValidityUnit] = useState<"month" | "day">("month");
  const [memo, setMemo] = useState("");
  const [active, setActive] = useState(true);

  function reset() {
    setPassType("kindergarten");
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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>이용권 타입</Label>
            <Tabs value={passType} onValueChange={(v) => setPassType(v as ServiceType)}>
              <TabsList className="grid w-full grid-cols-4">
                {SERVICE_TYPES.map((t) => (
                  <TabsTrigger key={t} value={t}>
                    {SERVICE_LABELS[t]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>이용권 횟수</Label>
              <Input
                type="number"
                min="1"
                value={totalCount}
                onChange={(e) => setTotalCount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>이용권 금액 (원)</Label>
              <Input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>유효기간 (발급일로부터)</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                min="0"
                value={validityValue}
                onChange={(e) => setValidityValue(e.target.value)}
              />
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
              <span className="text-sm text-muted-foreground">
                {active ? "활성화" : "비활성화"}
              </span>
              <Switch id="pass-active" checked={active} onCheckedChange={setActive} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            등록하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
