import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { MobileSubTabLink } from "@/components/MobileSubTabs";
import { Input } from "@/components/ui/input";
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

function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}

export const Route = createFileRoute("/_authenticated/passes-usage")({
  head: () => ({
    meta: [
      { title: "이용권 사용현황 | 허그앤멍 예약관리" },
      {
        name: "description",
        content: "반려견에게 지급된 이용권의 사용 현황을 확인합니다.",
      },
      { property: "og:title", content: "이용권 사용현황 | 허그앤멍 예약관리" },
      { property: "og:description", content: "지급된 이용권 목록 조회" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PassesUsagePage,
});

type UsageRow = {
  id: string;
  title: string;
  pass_type: string;
  total_count: number;
  used_count: number;
  price: number;
  purchased_on: string;
  expires_on: string | null;
  active: boolean;
  dogs: { id: string; name: string; owners: { name: string; phone: string } | null } | null;
};

function PassesUsagePage() {
  const [search, setSearch] = useState("");

  const usageQuery = useQuery({
    queryKey: ["passes", "usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("passes")
        .select(
          "id, title, pass_type, total_count, used_count, price, purchased_on, expires_on, active, dogs(id, name, owners(name, phone))",
        )
        .not("dog_id", "is", null)
        .order("purchased_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as UsageRow[];
    },
  });

  const rows = usageQuery.data ?? [];
  const filtered = rows.filter((r) => {
    const k = search.trim().toLowerCase();
    if (!k) return true;
    return [r.title, r.dogs?.name, r.dogs?.owners?.name].some((v) =>
      (v ?? "").toLowerCase().includes(k),
    );
  });

  return (
    <AppShell
      title="이용권 사용현황"
      description="반려견에게 지급된 이용권의 사용 현황을 확인합니다."
      hideTitleOnMobile
      mobileSubTabs={
        <>
          <MobileSubTabLink to="/passes" active={false}>
            이용권 설정
          </MobileSubTabLink>
          <MobileSubTabLink to="/passes-usage" active>
            이용권 사용현황
          </MobileSubTabLink>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 sm:w-72 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="반려견, 보호자, 이용권명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-[43px] bg-white pl-9 placeholder:text-sm"
          />
        </div>
      </div>

      {/* 모바일: 카드 UI */}
      <div className="space-y-3 sm:hidden">
        {usageQuery.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            지급된 이용권이 없습니다.
          </p>
        ) : (
          filtered.map((r) => {
            const remaining = Math.max(0, r.total_count - r.used_count);
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold">{r.dogs?.name ?? "-"}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.active ? "활성화" : "비활성화"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {r.title} · {PASS_TYPE_LABELS[r.pass_type] ?? r.pass_type}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-y-1.5 border-t border-border/60 pt-2 text-xs">
                  <span className="text-muted-foreground">보호자</span>
                  <span className="text-right font-semibold">{r.dogs?.owners?.name ?? "-"}</span>
                  <span className="text-muted-foreground">잔여/총</span>
                  <span className="text-right font-semibold">
                    {r.pass_type === "balance"
                      ? `${formatWon(remaining)} / ${formatWon(r.total_count)}`
                      : `${formatCount(remaining)}/${formatCount(r.total_count)}`}
                  </span>
                  <span className="text-muted-foreground">금액</span>
                  <span className="text-right font-semibold">{formatWon(r.price)}</span>
                  <span className="text-muted-foreground">유효기간</span>
                  <span className="text-right font-semibold">
                    {r.expires_on ? `~${r.expires_on}` : "무제한"}
                  </span>
                  <span className="text-muted-foreground">지급일</span>
                  <span className="text-right font-semibold">{r.purchased_on}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border bg-card sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-0 text-[11px] sm:min-w-[820px] sm:text-sm">
            <thead className="bg-secondary/60 text-center text-xs font-bold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">반려견</th>
                <th className="px-4 py-3">보호자</th>
                <th className="px-4 py-3">이용권</th>
                <th className="px-4 py-3">구분</th>
                <th className="px-4 py-3">잔여/총</th>
                <th className="px-4 py-3">금액</th>
                <th className="px-4 py-3">유효기간</th>
                <th className="px-4 py-3">지급일</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {usageQuery.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    불러오는 중…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    지급된 이용권이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const remaining = Math.max(0, r.total_count - r.used_count);
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-border transition-colors hover:bg-secondary/50"
                    >
                      <td className="px-4 py-3 text-center font-bold">{r.dogs?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {r.dogs?.owners?.name ?? "-"}
                      </td>
                      <td className="px-4 py-3 truncate">{r.title}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {PASS_TYPE_LABELS[r.pass_type] ?? r.pass_type}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {r.pass_type === "balance"
                          ? `${formatWon(remaining)} / ${formatWon(r.total_count)}`
                          : `${formatCount(remaining)}/${formatCount(r.total_count)}`}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {formatWon(r.price)}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {r.expires_on ? `~${r.expires_on}` : "무제한"}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {r.purchased_on}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.active
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.active ? "활성화" : "비활성화"}
                        </span>
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
