import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { SERVICE_LABELS, SERVICE_TYPES, type ServiceType } from "@/lib/kindergarten";

const WEIGHT_CLASSES = [
  { value: "small", label: "소형" },
  { value: "small_medium", label: "중소형" },
  { value: "medium", label: "중형" },
  { value: "medium_large", label: "중대형" },
  { value: "large", label: "대형" },
] as const;

const SERVICE_UNIT_LABELS: Record<ServiceType, string> = {
  kindergarten: "1일 기준",
  hotel: "1박 기준",
  daily_care: "1시간 기준",
  grooming: "1회 기준",
};

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

function buildKey(serviceType: string, weightClass: string) {
  return `${serviceType}:${weightClass}`;
}

function ReservationSettingsPage() {
  const queryClient = useQueryClient();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loadedOnce, setLoadedOnce] = useState(false);

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
      const rows = SERVICE_TYPES.flatMap((t) =>
        WEIGHT_CLASSES.map((w) => ({
          service_type: t,
          weight_class: w.value,
          price: Number(prices[buildKey(t, w.value)] || 0),
        })),
      );
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

  return (
    <AppShell
      title="예약 설정"
      description="예약 타입 · 반려견 체중 구분별 요금을 설정합니다. 예약 등록 시 선택한 조건에 맞춰 총액이 자동 계산됩니다."
      action={
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "저장 중…" : "저장하기"}
        </Button>
      }
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-center text-xs font-bold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">체중 구분</th>
                {SERVICE_TYPES.map((t) => (
                  <th key={t} className="px-4 py-3">
                    {SERVICE_LABELS[t]}
                    <span className="block text-[10px] font-normal">{SERVICE_UNIT_LABELS[t]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pricingQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    불러오는 중…
                  </td>
                </tr>
              ) : (
                WEIGHT_CLASSES.map((w) => (
                  <tr key={w.value} className="border-t border-border">
                    <td className="px-4 py-3 text-center font-bold">{w.label}</td>
                    {SERVICE_TYPES.map((t) => {
                      const key = buildKey(t, w.value);
                      return (
                        <td key={t} className="px-4 py-3">
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
    </AppShell>
  );
}
