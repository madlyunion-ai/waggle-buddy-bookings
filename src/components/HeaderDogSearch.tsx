import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Search, Ticket } from "lucide-react";

import { DogPassDialog } from "@/components/DogPassDialog";
import { NewReservationDialog } from "@/components/NewReservationDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listLocalPets, type LocalPet } from "@/lib/petsync.functions";
import { GENDER_LABELS, ageLabel, toDateKey } from "@/lib/kindergarten";

/** 헤더 중앙 반려견 검색: 검색 → 기본정보 팝업 → 예약하기/이용권 지급으로 이어지는 진입점 */
export function HeaderDogSearch() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedPet, setSelectedPet] = useState<LocalPet | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchPets = useServerFn(listLocalPets);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ["header-dog-search", debounced],
    queryFn: () => fetchPets({ data: { search: debounced, page: 1, limit: 8 } }),
    enabled: debounced.length > 0,
  });

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const results = searchQuery.data?.pets ?? [];

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setDropdownOpen(true);
        }}
        onFocus={() => setDropdownOpen(true)}
        placeholder="반려견 이름으로 검색"
        className="h-8 w-full rounded-full border border-border bg-white pl-9 pr-3 text-xs text-black placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />

      {dropdownOpen && debounced.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-card text-left shadow-lg">
          {searchQuery.isLoading ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">검색 중…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">검색 결과가 없습니다.</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedPet(p);
                  setDropdownOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-secondary"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-[10px] font-extrabold text-primary">
                  {p.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-blue-600">{p.name}</span>
                <span className="shrink-0 truncate text-muted-foreground">
                  {p.ownerNames[0] ?? "보호자 미확인"}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      <Dialog
        open={selectedPet !== null && !reserveOpen}
        onOpenChange={(v) => !v && setSelectedPet(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedPet?.name ?? ""}</DialogTitle>
          </DialogHeader>
          {selectedPet ? (
            <div className="space-y-3">
              <dl className="divide-y divide-border rounded-xl border border-border">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="shrink-0 text-xs font-semibold text-muted-foreground">견종</dt>
                  <dd className="truncate text-right font-semibold">
                    {selectedPet.breed ?? "견종 미입력"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="shrink-0 text-xs font-semibold text-muted-foreground">성별</dt>
                  <dd className="truncate text-right font-semibold">
                    {GENDER_LABELS[selectedPet.gender ?? "unknown"] ?? "미입력"}
                    {selectedPet.neutered ? " · 중성화" : ""}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="shrink-0 text-xs font-semibold text-muted-foreground">나이</dt>
                  <dd className="truncate text-right font-semibold">
                    {ageLabel(selectedPet.birthDate)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="shrink-0 text-xs font-semibold text-muted-foreground">몸무게</dt>
                  <dd className="truncate text-right font-semibold">
                    {selectedPet.weight ? `${selectedPet.weight}kg` : "미입력"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="shrink-0 text-xs font-semibold text-muted-foreground">보호자</dt>
                  <dd className="truncate text-right font-semibold">
                    {selectedPet.ownerNames[0] ?? "보호자 미확인"}
                    {selectedPet.ownerPhone ? ` · ${selectedPet.ownerPhone}` : ""}
                  </dd>
                </div>
              </dl>

              <div className="flex items-center gap-2">
                <Button className="h-9 flex-1 text-sm" onClick={() => setReserveOpen(true)}>
                  예약하기
                </Button>
                <DogPassDialog
                  pet={selectedPet}
                  triggerLabel="이용권 지급"
                  triggerClassName="h-9 flex-1 text-sm"
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {selectedPet ? (
        <NewReservationDialog
          defaultDate={toDateKey(new Date())}
          open={reserveOpen}
          onOpenChange={(next) => {
            setReserveOpen(next);
            if (!next) setSelectedPet(null);
          }}
          hideTrigger
          initialDogId={selectedPet.dbId}
          initialPetName={selectedPet.name}
        />
      ) : null}
    </div>
  );
}
