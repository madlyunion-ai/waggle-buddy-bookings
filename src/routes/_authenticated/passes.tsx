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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_LABELS, formatWon } from "@/lib/kindergarten";

export const Route = createFileRoute("/_authenticated/passes")({
  head: () => ({
    meta: [
      { title: "이용권 · 결제 관리 | 허그앤멍 예약관리" },
      { name: "description", content: "횟수권 잔여 횟수와 결제 상태를 관리하고 미결제 건을 바로 확인합니다." },
      { property: "og:title", content: "이용권 · 결제 관리 | 허그앤멍 예약관리" },
      { property: "og:description", content: "횟수권 잔여 횟수와 결제 상태 관리" },
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
  dogs: { id: string; name: string; owners: { name: string; phone: string } | null } | null;
};

function PassesPage() {
  const queryClient = useQueryClient();

  const passesQuery = useQuery({
    queryKey: ["passes", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("passes")
        .select(
          "id, title, pass_type, total_count, used_count, price, payment_status, purchased_on, expires_on, dogs(id, name, owners(name, phone))",
        )
        .order("purchased_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PassRow[];
    },
  });

  const passes = passesQuery.data ?? [];
  const unpaid = passes.filter((p) => p.payment_status === "unpaid");
  const revenue = passes.filter((p) => p.payment_status === "paid").reduce((sum, p) => sum + p.price, 0);

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

  return (
    <AppShell title="이용권 · 결제" description="횟수권 잔여 횟수와 결제 상태를 관리합니다." action={<NewPassDialog />}>
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
        <div className="surface-card flex items-center gap-4 border-accent/40 p-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/25 text-accent-foreground">
            <CreditCard className="size-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">미결제</p>
            <p className="text-2xl font-extrabold">{unpaid.length}</p>
          </div>
        </div>
        <div className="surface-card flex items-center gap-4 p-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CreditCard className="size-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">결제 완료 합계</p>
            <p className="text-2xl font-extrabold">{formatWon(revenue)}</p>
          </div>
        </div>
      </div>

      {passesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : passes.length === 0 ? (
        <div className="surface-card p-10 text-center">
          <p className="font-semibold">등록된 이용권이 없습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">“이용권 등록”으로 횟수권을 판매해 보세요.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {passes.map((pass) => {
            const remaining = Math.max(0, pass.total_count - pass.used_count);
            const percent = pass.total_count > 0 ? (pass.used_count / pass.total_count) * 100 : 0;
            return (
              <article key={pass.id} className="surface-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold">
                      {pass.dogs?.name ?? "삭제된 강아지"} · {pass.title}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      보호자 {pass.dogs?.owners?.name ?? "-"} · {formatWon(pass.price)}
                    </p>
                  </div>
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
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">사용 {pass.used_count}회</span>
                    <span className="font-semibold">잔여 {remaining}회</span>
                  </div>
                  <Progress value={percent} />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    구매 {pass.purchased_on}
                    {pass.expires_on ? ` · 만료 ${pass.expires_on}` : ""}
                  </span>
                  {pass.payment_status === "unpaid" ? (
                    <Button size="sm" onClick={() => markPaid.mutate(pass.id)}>
                      결제 완료 처리
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function NewPassDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dogId, setDogId] = useState("");
  const [title, setTitle] = useState("10회 이용권");
  const [totalCount, setTotalCount] = useState("10");
  const [price, setPrice] = useState("300000");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [expiresOn, setExpiresOn] = useState("");

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
      const { error } = await supabase.from("passes").insert({
        dog_id: dogId,
        title: title.trim(),
        total_count: Number(totalCount),
        price: Number(price),
        payment_status: paymentStatus,
        paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
        expires_on: expiresOn || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passes"] });
      toast.success("이용권을 등록했습니다");
      setOpen(false);
      setDogId("");
    },
    onError: (e: Error) => toast.error("등록에 실패했습니다", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> 이용권 등록
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이용권 등록</DialogTitle>
          <DialogDescription>결제 완료된 이용권은 예약 등록 시 자동으로 연결됩니다.</DialogDescription>
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
          <div className="space-y-2">
            <Label>이용권 이름</Label>
            <Input maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>총 횟수</Label>
              <Input type="number" min="1" value={totalCount} onChange={(e) => setTotalCount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>금액 (원)</Label>
              <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>결제 상태</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">결제완료</SelectItem>
                  <SelectItem value="unpaid">미결제</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>만료일</Label>
              <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!dogId || !title.trim() || create.isPending} onClick={() => create.mutate()}>
            등록하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
