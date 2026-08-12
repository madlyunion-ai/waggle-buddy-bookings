import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BedDouble, CalendarCheck, Car, Clock, Scissors, Ticket, Wallet } from "lucide-react";
import { toast } from "sonner";

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
import { supabase } from "@/integrations/supabase/client";
import { formatWon } from "@/lib/kindergarten";

const PASS_TYPE_LABELS: Record<string, string> = {
  kindergarten: "유치원 이용권",
  hotel: "호텔 이용권",
  daily_care: "데이케어",
  grooming: "미용 기본",
  pickup_dropoff: "픽드랍",
  balance: "금액권",
};

const PASS_TYPES = [
  "kindergarten",
  "hotel",
  "daily_care",
  "grooming",
  "pickup_dropoff",
  "balance",
] as const;

const PASS_TYPE_BORDER: Record<string, string> = {
  kindergarten: "border-primary/40",
  hotel: "border-accent/50",
  daily_care: "border-rose-300/60",
  grooming: "border-warning/50",
  pickup_dropoff: "border-gray-300/60",
  balance: "border-amber-800/40",
};

const PASS_TYPE_ICONS: Record<string, typeof CalendarCheck> = {
  kindergarten: CalendarCheck,
  hotel: BedDouble,
  daily_care: Clock,
  grooming: Scissors,
  pickup_dropoff: Car,
  balance: Wallet,
};

const PASS_TYPE_ICON_STYLES: Record<string, string> = {
  kindergarten: "bg-primary/10 text-primary",
  hotel: "bg-accent/20 text-accent-foreground",
  daily_care: "bg-rose-300/15 text-rose-500",
  grooming: "bg-warning/20 text-warning-foreground",
  pickup_dropoff: "bg-gray-300/25 text-gray-600",
  balance: "bg-amber-800/10 text-amber-800",
};

type DogPass = {
  id: string;
  title: string;
  pass_type: string;
  total_count: number;
  used_count: number;
  price: number;
  expires_on: string | null;
  active: boolean;
};

type CatalogPass = {
  id: string;
  title: string;
  pass_type: string;
  total_count: number;
  price: number;
  expires_on: string | null;
  weight_class: string | null;
  trip_type: string | null;
  pricing_basis: string | null;
};

/** 반려견이 보유한 이용권을 확인하고, 이용권 관리에 등록된 상품을 지급하는 다이얼로그 */
export function DogPassDialog({
  pet,
  triggerLabel = "이용권",
  triggerClassName = "h-8 px-2.5 text-xs",
}: {
  pet: { id: string; dbId: string; name: string };
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [catalogType, setCatalogType] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [dailyCareHours, setDailyCareHours] = useState("1");

  const dogPassesQuery = useQuery({
    queryKey: ["passes", "for-dog", pet.dbId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("passes")
        .select("id, title, pass_type, total_count, used_count, price, expires_on, active")
        .eq("dog_id", pet.dbId)
        .order("purchased_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DogPass[];
    },
    enabled: open,
  });

  const catalogQuery = useQuery({
    queryKey: ["passes", "catalog", "all-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("passes")
        .select(
          "id, title, pass_type, total_count, price, expires_on, weight_class, trip_type, pricing_basis",
        )
        .is("dog_id", null)
        .eq("active", true)
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CatalogPass[];
    },
    enabled: open,
  });

  const grant = useMutation({
    mutationFn: async () => {
      const catalog = (catalogQuery.data ?? []).find((c) => c.id === catalogId);
      if (!catalog) throw new Error("지급할 이용권을 선택해 주세요.");
      const isDailyCare = catalog.pass_type === "daily_care";
      const hours = Number(dailyCareHours || 0);
      const pricePerHour = catalog.total_count > 0 ? catalog.price / (catalog.total_count / 60) : 0;
      const { error } = await supabase.from("passes").insert({
        dog_id: pet.dbId,
        pass_type: catalog.pass_type,
        title: catalog.title,
        total_count: isDailyCare ? Math.round(hours * 60) : catalog.total_count,
        price: isDailyCare ? Math.round(pricePerHour * hours) : catalog.price,
        payment_status: "paid",
        expires_on: catalog.expires_on,
        weight_class: catalog.weight_class,
        trip_type: catalog.trip_type,
        pricing_basis: catalog.pricing_basis,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passes"] });
      queryClient.refetchQueries({ queryKey: ["passes", "for-dog", pet.dbId] });
      toast.success("이용권을 지급했습니다");
      setCatalogType("");
      setCatalogId("");
      setDailyCareHours("1");
    },
    onError: (e: Error) => toast.error("지급에 실패했습니다", { description: e.message }),
  });

  const passes = dogPassesQuery.data ?? [];
  const selectedCatalog = (catalogQuery.data ?? []).find((c) => c.id === catalogId);
  const isDailyCareSelected = selectedCatalog?.pass_type === "daily_care";
  const dailyCarePricePerHour =
    selectedCatalog && selectedCatalog.total_count > 0
      ? selectedCatalog.price / (selectedCatalog.total_count / 60)
      : 0;
  const previewTotal = selectedCatalog
    ? isDailyCareSelected
      ? Math.round(dailyCarePricePerHour * Number(dailyCareHours || 0))
      : selectedCatalog.price
    : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={triggerClassName}>
          <Ticket className="hidden size-3.5 sm:inline" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pet.name} 이용권</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">보유 이용권</p>
          {dogPassesQuery.isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중…</p>
          ) : passes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              보유한 이용권이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {passes.map((p) => {
                const remaining = Math.max(0, p.total_count - p.used_count);
                const Icon = PASS_TYPE_ICONS[p.pass_type] ?? Ticket;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border bg-card p-3 shadow-sm ${
                      PASS_TYPE_BORDER[p.pass_type] ?? "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                          PASS_TYPE_ICON_STYLES[p.pass_type] ?? "bg-secondary text-foreground"
                        }`}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold">{p.title}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              p.active
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {p.active ? "활성화" : "비활성화"}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {PASS_TYPE_LABELS[p.pass_type] ?? p.pass_type}
                          {" · "}
                          {p.expires_on ? `~${p.expires_on}까지` : "무제한"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2 border-t border-border/60 pt-2">
                      <p className="text-xs text-muted-foreground">
                        {p.pass_type === "balance" ? (
                          <>
                            잔여{" "}
                            <span className="font-bold text-blue-600">{formatWon(remaining)}</span>
                          </>
                        ) : (
                          <>
                            잔여 <span className="font-bold text-blue-600">{remaining}</span>
                            <span className="text-foreground">/{p.total_count}</span>회
                          </>
                        )}
                      </p>
                      <p className="text-base font-bold">{formatWon(p.price)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted-foreground">이용권 추가</p>
          <div className="grid grid-cols-10 gap-2">
            <Select
              value={catalogType}
              onValueChange={(v) => {
                setCatalogType(v);
                setCatalogId("");
              }}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="타입 선택" />
              </SelectTrigger>
              <SelectContent>
                {PASS_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {PASS_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={catalogId} onValueChange={setCatalogId} disabled={!catalogType}>
              <SelectTrigger className="col-span-7">
                <SelectValue
                  placeholder={!catalogType ? "타입을 먼저 선택하세요" : "이용권 선택"}
                />
              </SelectTrigger>
              <SelectContent>
                {(catalogQuery.data ?? [])
                  .filter((c) => c.pass_type === catalogType)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title} · {formatWon(c.price)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {isDailyCareSelected ? (
            <div className="space-y-2">
              <Label>이용 시간(시간)</Label>
              <Input
                type="number"
                min="0"
                value={dailyCareHours}
                onChange={(e) => setDailyCareHours(e.target.value)}
              />
            </div>
          ) : null}

          {selectedCatalog ? (
            <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm font-bold">
              <span>합계</span>
              <span className="text-primary">{formatWon(previewTotal)}</span>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            이용권 관리에서 등록한 이용권 상품 중 하나를 선택해 이 반려견에게 지급합니다.
          </p>
        </div>

        <DialogFooter>
          <Button disabled={!catalogId || grant.isPending} onClick={() => grant.mutate()}>
            {grant.isPending ? "지급 중…" : "지급하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
