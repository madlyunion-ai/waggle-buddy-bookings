import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { SERVICE_LABELS, SERVICE_TYPES, type ServiceType } from "@/lib/kindergarten";

const SERVICE_UNIT_LABELS: Record<ServiceType, string> = {
  kindergarten: "1일 기준",
  hotel: "1박 기준",
  daily_care: "1시간 기준",
  grooming: "1회 기준",
};

const PICKUP_DROPOFF_TYPE = "pickup_dropoff" as const;

export const Route = createFileRoute("/_authenticated/reservation-settings")({
  head: () => ({
    meta: [
      { title: "예약 설정 | 허그앤멍 예약관리" },
      {
        name: "description",
        content: "예약 타입과 반려견 체중 구분별 요금을 설정합니다.",
      },
      { property: "og:title", content: "예약 설정 | 허그앤멍 예약관리" },
      { property: "og:description", content: "예약 요금표 설정" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReservationSettingsPage,
});

type PricingRow = { service_type: string; weight_class: string; price: number };
type OptionRow = {
  id: string;
  kind: "service_type" | "weight_class";
  value: string;
  label: string;
};

function buildKey(serviceType: string, weightClass: string) {
  return `${serviceType}:${weightClass}`;
}

function ReservationSettingsPage() {
  const queryClient = useQueryClient();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["reservation-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_options")
        .select("id, kind, value, label")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OptionRow[];
    },
  });

  const customServiceTypes = (optionsQuery.data ?? []).filter((o) => o.kind === "service_type");
  const weightClasses = (optionsQuery.data ?? []).filter((o) => o.kind === "weight_class");

  const PRICING_COLUMNS = [
    ...SERVICE_TYPES.map((t) => ({
      type: t as string,
      label: SERVICE_LABELS[t],
      unit: SERVICE_UNIT_LABELS[t],
    })),
    ...customServiceTypes.map((o) => ({ type: o.value, label: o.label, unit: "1회 기준" })),
    { type: PICKUP_DROPOFF_TYPE as string, label: "픽드랍", unit: "편도 1회 기준" },
  ];

  const pricingQuery = useQuery({
    queryKey: ["reservation-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_pricing")
        .select("service_type, weight_class, price");
      if (error) throw error;
      return (data ?? []) as PricingRow[];
    },
  });

  if (pricingQuery.data && !loadedOnce) {
    setLoadedOnce(true);
    const next: Record<string, string> = {};
    for (const r of pricingQuery.data) {
      next[buildKey(r.service_type, r.weight_class)] = String(r.price);
    }
    setPrices(next);
  }

  const save = useMutation({
    mutationFn: async () => {
      const rows = PRICING_COLUMNS.flatMap((c) =>
        weightClasses.map((w) => ({
          service_type: c.type,
          weight_class: w.value,
          price: Number(prices[buildKey(c.type, w.value)] || 0),
        })),
      );
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("reservation_pricing")
        .upsert(rows, { onConflict: "service_type,weight_class" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservation-pricing"] });
      toast.success("요금표를 저장했습니다");
    },
    onError: (e: Error) => toast.error("저장에 실패했습니다", { description: e.message }),
  });

  const isLoading = pricingQuery.isLoading || optionsQuery.isLoading;

  return (
    <AppShell
      title="예약 설정"
      description="예약 타입 · 반려견 체중 구분별 요금을 설정합니다. 예약 등록 시 선택한 조건에 맞춰 총액이 자동 계산됩니다."
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setManagerOpen(true)}>
            <Plus className="size-4" /> 추가하기
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "저장 중…" : "저장하기"}
          </Button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-center text-xs font-bold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">체중 구분</th>
                {PRICING_COLUMNS.map((c) => (
                  <th key={c.type} className="px-4 py-3">
                    {c.label}
                    <span className="block text-[10px] font-normal">{c.unit}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={PRICING_COLUMNS.length + 1}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    불러오는 중…
                  </td>
                </tr>
              ) : weightClasses.length === 0 ? (
                <tr>
                  <td
                    colSpan={PRICING_COLUMNS.length + 1}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    체중 구분이 없습니다. "추가하기"에서 먼저 등록해 주세요.
                  </td>
                </tr>
              ) : (
                weightClasses.map((w) => (
                  <tr key={w.value} className="border-t border-border">
                    <td className="px-4 py-3 text-center font-bold">{w.label}</td>
                    {PRICING_COLUMNS.map((c) => {
                      const key = buildKey(c.type, w.value);
                      return (
                        <td key={c.type} className="px-4 py-3">
                          <Input
                            type="number"
                            min="0"
                            value={prices[key] ?? "0"}
                            onChange={(e) =>
                              setPrices((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <OptionsManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        customServiceTypes={customServiceTypes}
        weightClasses={weightClasses}
      />
    </AppShell>
  );
}

function OptionsManagerDialog({
  open,
  onOpenChange,
  customServiceTypes,
  weightClasses,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customServiceTypes: OptionRow[];
  weightClasses: OptionRow[];
}) {
  const queryClient = useQueryClient();
  const [newServiceLabel, setNewServiceLabel] = useState("");
  const [newWeightLabel, setNewWeightLabel] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["reservation-options"] });

  const addOption = useMutation({
    mutationFn: async ({
      kind,
      label,
    }: {
      kind: "service_type" | "weight_class";
      label: string;
    }) => {
      const value = `custom_${Date.now()}`;
      const { error } = await supabase.from("reservation_options").insert({
        kind,
        value,
        label: label.trim(),
        sort_order: Date.now(),
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      invalidate();
      if (variables.kind === "service_type") setNewServiceLabel("");
      else setNewWeightLabel("");
      toast.success("항목을 추가했습니다");
    },
    onError: (e: Error) => toast.error("추가에 실패했습니다", { description: e.message }),
  });

  const renameOption = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase
        .from("reservation_options")
        .update({ label: label.trim() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("수정에 실패했습니다", { description: e.message }),
  });

  const deleteOption = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reservation_options").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("항목을 삭제했습니다");
    },
    onError: (e: Error) => toast.error("삭제에 실패했습니다", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>예약 옵션 관리</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>예약 타입 추가</Label>
            <p className="text-xs text-muted-foreground">
              기본 예약 타입(유치원/호텔/데일리케어/미용)은 여기서 삭제할 수 없습니다. 새로 추가한
              타입은 예약 등록 화면에서 날짜·시간을 입력하는 일반 형태로 표시됩니다.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="예: 놀이터 이용권"
                value={newServiceLabel}
                onChange={(e) => setNewServiceLabel(e.target.value)}
              />
              <Button
                type="button"
                disabled={!newServiceLabel.trim() || addOption.isPending}
                onClick={() => addOption.mutate({ kind: "service_type", label: newServiceLabel })}
              >
                추가
              </Button>
            </div>
            {customServiceTypes.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                {customServiceTypes.map((o) => (
                  <OptionRowEditor
                    key={o.id}
                    option={o}
                    onRename={(label) => renameOption.mutate({ id: o.id, label })}
                    onDelete={() => deleteOption.mutate(o.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <Label>체중 구분 관리</Label>
            <div className="flex gap-2">
              <Input
                placeholder="예: 초대형"
                value={newWeightLabel}
                onChange={(e) => setNewWeightLabel(e.target.value)}
              />
              <Button
                type="button"
                disabled={!newWeightLabel.trim() || addOption.isPending}
                onClick={() => addOption.mutate({ kind: "weight_class", label: newWeightLabel })}
              >
                추가
              </Button>
            </div>
            <div className="space-y-1.5 pt-1">
              {weightClasses.map((o) => (
                <OptionRowEditor
                  key={o.id}
                  option={o}
                  onRename={(label) => renameOption.mutate({ id: o.id, label })}
                  onDelete={() => deleteOption.mutate(o.id)}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionRowEditor({
  option,
  onRename,
  onDelete,
}: {
  option: OptionRow;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(option.label);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
      <Input
        className="h-8"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label.trim() && label.trim() !== option.label) onRename(label.trim());
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 px-2 text-destructive hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
