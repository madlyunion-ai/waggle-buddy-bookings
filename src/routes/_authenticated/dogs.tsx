import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { OwnerInfoDialog } from "@/components/OwnerInfoDialog";
import { ReserveDialog } from "@/components/ReserveDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listLocalPets, syncPetsToDb } from "@/lib/petsync.functions";
import { GENDER_LABELS, ageLabel } from "@/lib/kindergarten";


export const Route = createFileRoute("/_authenticated/dogs")({
  head: () => ({
    meta: [
      { title: "반려견 리스트 | 허그앤멍 예약관리" },
      { name: "description", content: "외부 회원 시스템의 반려견 목록을 조회하고 바로 예약을 등록합니다." },
      { property: "og:title", content: "반려견 리스트 | 허그앤멍 예약관리" },
      { property: "og:description", content: "반려견 목록 조회 및 즉시 예약" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DogsPage,
});

const PAGE_SIZE = 50;

function DogsPage() {
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const syncedOnce = useRef(false);

  const fetchPets = useServerFn(listLocalPets);
  const runSync = useServerFn(syncPetsToDb);

  const petsQuery = useQuery({
    queryKey: ["local-pets", search, page],
    queryFn: () => fetchPets({ data: { search, page, limit: PAGE_SIZE } }),
  });

  const sync = useMutation({
    mutationFn: () => runSync({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["local-pets"] }),
  });

  // 페이지 진입 시 외부 시스템과 자동 동기화 (백그라운드)
  useEffect(() => {
    if (syncedOnce.current) return;
    syncedOnce.current = true;
    sync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pets = petsQuery.data?.pets ?? [];
  const total = petsQuery.data?.total ?? pets.length;
  const lastSyncedAt = petsQuery.data?.lastSyncedAt ?? null;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applySearch() {
    setPage(1);
    setSearch(keyword.trim());
  }

  return (
    <AppShell
      title="반려견 리스트"
      description="데이터베이스에 저장된 반려견 목록입니다. 페이지 진입 시 외부 회원 시스템과 자동 동기화됩니다."
      action={
        <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw className={`size-4 ${sync.isPending ? "animate-spin" : ""}`} />
          {sync.isPending ? "동기화 중…" : "동기화"}
        </Button>
      }
    >

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="bg-white pl-9"
            placeholder="반려견 이름, 견종, 보호자 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
            }}
          />
        </div>
        <Button onClick={applySearch}>검색</Button>
        <span className="ml-auto text-sm text-muted-foreground">
          전체 {total.toLocaleString("ko-KR")}마리
          {lastSyncedAt ? ` · 최근 동기화 ${new Date(lastSyncedAt).toLocaleString("ko-KR")}` : ""}
        </span>

      </div>

      <div className="surface-card overflow-hidden p-0">
        <div className="hidden grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_0.7fr_1.4fr_auto] gap-3 border-b border-border bg-muted/50 px-4 py-3 text-xs font-bold text-muted-foreground lg:grid">
          <span>이름</span>
          <span>견종</span>
          <span>성별</span>
          <span>나이</span>
          <span>몸무게</span>
          <span>보호자</span>
          <span className="text-right">예약</span>
        </div>

        {petsQuery.isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">데이터베이스에서 불러오는 중…</p>

        ) : petsQuery.isError ? (
          <p className="p-8 text-center text-sm font-semibold text-destructive">
            반려견 목록을 불러오지 못했습니다. 다시 시도해 주세요.
          </p>
        ) : pets.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">조회된 반려견이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pets.map((pet) => (
              <li
                key={pet.id}
                className="grid grid-cols-2 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-secondary/50 lg:grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_0.7fr_1.4fr_auto]"
              >
                <div className="col-span-2 flex items-center gap-2.5 lg:col-span-1">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-sm font-extrabold text-primary">
                    {pet.name.slice(0, 1)}
                  </div>
                  <span className="truncate font-bold">{pet.name}</span>
                  {pet.neutered ? (
                    <Badge variant="outline" className="text-[10px]">
                      중성화
                    </Badge>
                  ) : null}
                </div>
                <span className="truncate text-muted-foreground">{pet.breed ?? "견종 미입력"}</span>
                <span>{GENDER_LABELS[pet.gender ?? "unknown"] ?? "미입력"}</span>
                <span className="text-muted-foreground">{ageLabel(pet.birthDate)}</span>
                <span className="text-muted-foreground">{pet.weight ? `${pet.weight}kg` : "-"}</span>
                <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                  <span className="truncate">
                    {pet.ownerNames[0] ?? "보호자 미확인"}
                    {pet.ownerPhone ? ` · ${pet.ownerPhone}` : ""}
                  </span>
                  <OwnerInfoDialog pet={pet} />
                </span>
                <span className="col-span-2 flex justify-end lg:col-span-1">
                  <ReserveDialog pet={pet} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="size-4" /> 이전
        </Button>
        <span className="text-sm font-semibold">
          {page} / {maxPage}
        </span>
        <Button variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>
          다음 <ChevronRight className="size-4" />
        </Button>
      </div>
    </AppShell>
  );
}
