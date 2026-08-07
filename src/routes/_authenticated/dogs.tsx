import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Plus, Search } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { GENDER_LABELS, ageLabel } from "@/lib/kindergarten";

export const Route = createFileRoute("/_authenticated/dogs")({
  head: () => ({
    meta: [
      { title: "강아지 · 보호자 프로필 | 허그앤멍 예약관리" },
      { name: "description", content: "견종, 나이, 몸무게, 백신 만료일, 특이사항과 보호자 연락처를 함께 관리합니다." },
      { property: "og:title", content: "강아지 · 보호자 프로필 | 허그앤멍 예약관리" },
      { property: "og:description", content: "강아지 프로필과 보호자 연락처 관리" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DogsPage,
});

type DogRow = {
  id: string;
  name: string;
  breed: string | null;
  gender: string;
  neutered: boolean;
  birth_date: string | null;
  weight_kg: number | null;
  vaccine_expires_on: string | null;
  notes: string | null;
  active: boolean;
  owners: { id: string; name: string; phone: string; memo: string | null } | null;
};

function DogsPage() {
  const [keyword, setKeyword] = useState("");

  const dogsQuery = useQuery({
    queryKey: ["dogs", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dogs")
        .select(
          "id, name, breed, gender, neutered, birth_date, weight_kg, vaccine_expires_on, notes, active, owners(id, name, phone, memo)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DogRow[];
    },
  });

  const dogs = (dogsQuery.data ?? []).filter((d) => {
    const q = keyword.trim();
    if (!q) return true;
    return [d.name, d.breed, d.owners?.name, d.owners?.phone].some((v) => v?.includes(q));
  });

  return (
    <AppShell
      title="강아지 · 보호자"
      description="등록된 원생과 보호자 정보를 관리합니다."
      action={<NewDogDialog />}
    >
      <div className="mb-5 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="강아지 이름, 견종, 보호자 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {dogsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : dogs.length === 0 ? (
        <div className="surface-card p-10 text-center">
          <p className="font-semibold">등록된 강아지가 없습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">“원생 등록”으로 첫 원생을 추가해 보세요.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {dogs.map((dog) => (
            <article key={dog.id} className="surface-card p-5">
              <div className="flex items-start gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-secondary font-display text-xl font-extrabold text-primary">
                  {dog.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold">{dog.name}</h2>
                    <Badge variant="secondary">{GENDER_LABELS[dog.gender] ?? "미입력"}</Badge>
                    {dog.neutered ? <Badge variant="outline">중성화</Badge> : null}
                    {!dog.active ? <Badge variant="outline">퇴원</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {dog.breed ?? "견종 미입력"} · {ageLabel(dog.birth_date)}
                    {dog.weight_kg ? ` · ${dog.weight_kg}kg` : ""}
                  </p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">보호자</dt>
                  <dd className="font-medium">{dog.owners?.name ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">연락처</dt>
                  <dd className="font-medium">{dog.owners?.phone ?? "-"}</dd>
                </div>
              </dl>

              {dog.notes ? (
                <p className="mt-3 rounded-lg bg-accent/15 p-3 text-sm">특이사항: {dog.notes}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function NewDogDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ownerMode, setOwnerMode] = useState<"new" | "existing">("new");
  const [ownerId, setOwnerId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState("unknown");
  const [neutered, setNeutered] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [weight, setWeight] = useState("");
  const [vaccine, setVaccine] = useState("");
  const [notes, setNotes] = useState("");

  const ownersQuery = useQuery({
    queryKey: ["owners", "options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("owners").select("id, name, phone").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => {
      let resolvedOwnerId = ownerId;
      if (ownerMode === "new") {
        const { data, error } = await supabase
          .from("owners")
          .insert({ name: ownerName.trim(), phone: ownerPhone.trim() })
          .select("id")
          .single();
        if (error) throw error;
        resolvedOwnerId = data.id;
      }
      const { error } = await supabase.from("dogs").insert({
        owner_id: resolvedOwnerId,
        name: name.trim(),
        breed: breed.trim() || null,
        gender,
        neutered,
        birth_date: birthDate || null,
        weight_kg: weight ? Number(weight) : null,
        vaccine_expires_on: vaccine || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
      toast.success("원생을 등록했습니다");
      setOpen(false);
      setName("");
      setBreed("");
      setNotes("");
      setOwnerName("");
      setOwnerPhone("");
    },
    onError: (e: Error) => toast.error("등록에 실패했습니다", { description: e.message }),
  });

  const valid = name.trim() && (ownerMode === "existing" ? ownerId : ownerName.trim() && ownerPhone.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> 원생 등록
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>원생 등록</DialogTitle>
          <DialogDescription>강아지 정보와 보호자 연락처를 함께 등록합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={ownerMode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setOwnerMode("new")}
            >
              새 보호자
            </Button>
            <Button
              type="button"
              variant={ownerMode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => setOwnerMode("existing")}
            >
              기존 보호자
            </Button>
          </div>

          {ownerMode === "new" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>보호자 이름</Label>
                <Input maxLength={50} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>연락처</Label>
                <Input
                  maxLength={20}
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="010-0000-0000"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>보호자 선택</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="보호자를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {(ownersQuery.data ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} · {o.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>강아지 이름</Label>
              <Input maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>견종</Label>
              <Input maxLength={40} value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="포메라니안" />
            </div>
            <div className="space-y-2">
              <Label>성별</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">수컷</SelectItem>
                  <SelectItem value="female">암컷</SelectItem>
                  <SelectItem value="unknown">미입력</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>몸무게 (kg)</Label>
              <Input type="number" step="0.1" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>생일</Label>
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>백신 만료일</Label>
              <Input type="date" value={vaccine} onChange={(e) => setVaccine(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="neutered">중성화 완료</Label>
            <Switch id="neutered" checked={neutered} onCheckedChange={setNeutered} />
          </div>

          <div className="space-y-2">
            <Label>특이사항</Label>
            <Textarea
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="분리불안, 알레르기, 복용 약 등"
            />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            등록하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
