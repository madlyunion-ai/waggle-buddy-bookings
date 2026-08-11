import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { listExternalMembers, listExternalPets } from "@/lib/projectpet.functions";
import {
  GROOMING_SLOTS,
  SERVICE_LABELS,
  SERVICE_TYPES,
  addDays,
  addMinutes,
  nightsBetween,
  stayLabel,
  type ServiceType,
} from "@/lib/kindergarten";

const PICKUP_USAGE_MODES = [
  { value: "none", label: "사용안함" },
  { value: "pickup", label: "픽업" },
  { value: "dropoff", label: "드랍" },
  { value: "round_trip", label: "왕복" },
] as const;

export function NewReservationDialog({
  defaultDate,
  open: openProp,
  onOpenChange,
  hideTrigger,
  initialMember,
  initialPetId,
  initialDogId,
  initialPetName,
}: {
  defaultDate: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  /** 헤더 검색 등에서 특정 회원/반려견을 미리 선택된 상태로 열 때 사용 */
  initialMember?: { id: string; name: string };
  initialPetId?: string;
  /** 이미 동기화된 반려견의 내부 DB id. 있으면 회원/반려견 검색 없이 바로 이 반려견으로 예약한다 */
  initialDogId?: string;
  initialPetName?: string;
}) {
  const queryClient = useQueryClient();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  const usingKnownDog = !!initialDogId;

  const [serviceType, setServiceType] = useState<ServiceType>("kindergarten");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberId, setMemberId] = useState("");
  const [petId, setPetId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(() => addDays(defaultDate, 1));
  const [dropOff, setDropOff] = useState("09:00");
  const [pickUp, setPickUp] = useState("18:00");
  const [slot, setSlot] = useState("10:00");
  const [memo, setMemo] = useState("");
  const [passId, setPassId] = useState("none");
  const [pickupPassId, setPickupPassId] = useState("none");
  const [pickupUsageMode, setPickupUsageMode] =
    useState<(typeof PICKUP_USAGE_MODES)[number]["value"]>("none");

  const fetchMembers = useServerFn(listExternalMembers);
  const fetchPets = useServerFn(listExternalPets);

  const membersQuery = useQuery({
    queryKey: ["external-members", memberSearch],
    queryFn: () => fetchMembers({ data: { search: memberSearch, limit: 30 } }),
    enabled: open && !usingKnownDog,
  });

  const member = (membersQuery.data ?? []).find((m) => m.id === memberId) ?? null;

  const petsQuery = useQuery({
    queryKey: ["external-pets", memberId, member?.source ?? "owner"],
    queryFn: () =>
      fetchPets({
        data: { memberId, source: member?.source ?? "owner", search: member?.name ?? "" },
      }),
    enabled: open && !usingKnownDog && !!memberId,
  });

  const pet = (petsQuery.data ?? []).find((p) => p.id === petId) ?? null;

  // 선택한 반려견이 실제로 보유한 이용권 목록 (동기화된 강아지 기준)
  const passesQuery = useQuery({
    queryKey: ["passes", "for-external-pet", petId],
    queryFn: async () => {
      const { data: dog } = await supabase
        .from("dogs")
        .select("id")
        .eq("external_id", petId)
        .maybeSingle();
      if (!dog) return [];
      const { data, error } = await supabase
        .from("passes")
        .select("id, title, pass_type, total_count, used_count, payment_status, expires_on")
        .eq("dog_id", dog.id)
        .order("purchased_on", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!petId,
  });

  const ownedPasses = passesQuery.data ?? [];
  const availablePasses = ownedPasses.filter(
    (p) =>
      p.pass_type === serviceType && p.payment_status === "paid" && p.used_count < p.total_count,
  );
  const availablePickupPasses = ownedPasses.filter(
    (p) =>
      p.pass_type === "pickup_dropoff" &&
      p.payment_status === "paid" &&
      p.used_count < p.total_count,
  );

  const selectedPass = availablePasses.find((p) => p.id === passId);
  const selectedPickupPass = availablePickupPasses.find((p) => p.id === pickupPassId);

  const create = useMutation({
    mutationFn: async () => {
      let dogId: string;

      if (usingKnownDog) {
        dogId = initialDogId!;
      } else {
        if (!member || !pet) throw new Error("회원과 반려견을 선택해 주세요.");

        // 외부 회원을 내부 보호자 레코드와 동기화
        const { data: existingOwner } = await supabase
          .from("owners")
          .select("id")
          .eq("external_id", member.id)
          .maybeSingle();
        let ownerId = existingOwner?.id ?? null;
        if (!ownerId) {
          const { data: inserted, error: ownerError } = await supabase
            .from("owners")
            .insert({
              name: member.name,
              phone: member.phone ?? "-",
              email: member.email,
              external_id: member.id,
              external_source: member.source,
            })
            .select("id")
            .single();
          if (ownerError) throw ownerError;
          ownerId = inserted.id;
        }

        // 외부 반려견을 내부 강아지 레코드와 동기화
        const { data: existingDog } = await supabase
          .from("dogs")
          .select("id")
          .eq("external_id", pet.id)
          .maybeSingle();
        let resolvedDogId = existingDog?.id ?? null;
        if (!resolvedDogId) {
          const { data: insertedDog, error: dogError } = await supabase
            .from("dogs")
            .insert({
              owner_id: ownerId,
              name: pet.name,
              breed: pet.breed,
              birth_date: pet.birthDate,
              weight_kg: pet.weight,
              external_id: pet.id,
            })
            .select("id")
            .single();
          if (dogError) throw dogError;
          resolvedDogId = insertedDog.id;
        }
        dogId = resolvedDogId;
      }

      // 이용권 적용: 반려견이 실제로 보유한 이용권 중에서만 선택 가능
      // ("자동"이면 사용 가능한 이용권을 자동 적용)
      let appliedPassId: string | null = null;
      if (passId === "auto") {
        const { data: pass } = await supabase
          .from("passes")
          .select("id, total_count, used_count")
          .eq("dog_id", dogId)
          .eq("pass_type", serviceType)
          .eq("payment_status", "paid")
          .order("purchased_on", { ascending: true });
        appliedPassId = (pass ?? []).find((p) => p.used_count < p.total_count)?.id ?? null;
      } else if (passId !== "none") {
        appliedPassId = passId;
      }
      const appliedPickupPassId =
        pickupUsageMode !== "none" && pickupPassId !== "none" ? pickupPassId : null;

      const times =
        serviceType === "grooming"
          ? { drop_off_time: slot, pick_up_time: addMinutes(slot, 30) }
          : { drop_off_time: dropOff, pick_up_time: pickUp };

      const { error } = await supabase.from("reservations").insert({
        dog_id: dogId,
        service_type: serviceType,
        reserved_date: date,
        end_date:
          serviceType === "hotel" || (serviceType === "kindergarten" && endDate > date)
            ? endDate
            : null,
        ...times,
        memo: memo || null,
        pass_id: appliedPassId,
        pickup_pass_id: appliedPickupPassId,
        pickup_requested:
          appliedPickupPassId !== null &&
          (pickupUsageMode === "pickup" || pickupUsageMode === "round_trip"),
        dropoff_requested:
          appliedPickupPassId !== null &&
          (pickupUsageMode === "dropoff" || pickupUsageMode === "round_trip"),
      });
      if (error) throw error;

      // 이용권 적용 시 횟수 차감
      for (const id of [appliedPassId, appliedPickupPassId]) {
        if (!id) continue;
        const { data: applied } = await supabase
          .from("passes")
          .select("used_count, total_count")
          .eq("id", id)
          .maybeSingle();
        if (applied) {
          await supabase
            .from("passes")
            .update({ used_count: Math.min(applied.total_count, applied.used_count + 1) })
            .eq("id", id);
        }
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["passes"] });
      toast.success("예약을 등록했습니다");
      setOpen(false);
      setMemo("");
      setPetId("");
      setPassId("none");
      setPickupPassId("none");
      setPickupUsageMode("none");
    },
    onError: (e: Error) => toast.error("예약 등록에 실패했습니다", { description: e.message }),
  });

  const hotelInvalid = serviceType === "hotel" && nightsBetween(date, endDate) < 1;

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setEndDate(serviceType === "kindergarten" ? defaultDate : addDays(defaultDate, 1));
      if (initialMember) {
        setMemberSearch(initialMember.name);
        setMemberId(initialMember.id);
      }
      if (initialPetId) {
        setPetId(initialPetId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate, initialMember?.id, initialPetId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {hideTrigger ? null : (
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" /> 예약 등록
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>예약 등록</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>예약 타입</Label>
            <div className="grid grid-cols-4 gap-2">
              {SERVICE_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={serviceType === t ? "default" : "outline"}
                  onClick={() => {
                    setServiceType(t);
                    if (t === "kindergarten") setEndDate(date);
                  }}
                >
                  {SERVICE_LABELS[t]}
                </Button>
              ))}
            </div>
          </div>

          {usingKnownDog ? (
            <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-sm font-bold">
              {initialPetName ?? "선택한 반려견"} 반려견으로 예약을 등록합니다.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>회원 검색</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={memberSearch}
                    placeholder="이름 또는 전화번호로 검색"
                    onChange={(e) => {
                      setMemberSearch(e.target.value);
                      setMemberId("");
                      setPetId("");
                    }}
                  />
                  <Select
                    value={memberId}
                    onValueChange={(v) => {
                      setMemberId(v);
                      setPetId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          membersQuery.isLoading ? "회원을 불러오는 중…" : "회원을 선택하세요"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(membersQuery.data ?? []).map((m) => (
                        <SelectItem key={`${m.source}-${m.id}`} value={m.id}>
                          {m.name} · {m.phone ?? "연락처 없음"}
                          {m.source === "user" ? " (직원)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {membersQuery.isError ? (
                  <p className="text-xs font-semibold text-destructive">
                    외부 회원 목록을 불러오지 못했습니다.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>강아지</Label>
                <Select value={petId} onValueChange={setPetId} disabled={!memberId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !memberId
                          ? "회원을 먼저 선택하세요"
                          : petsQuery.isLoading
                            ? "불러오는 중…"
                            : (petsQuery.data ?? []).length === 0
                              ? "등록된 강아지가 없습니다."
                              : "강아지를 선택하세요"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(petsQuery.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.breed ? ` · ${p.breed}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>이용권 적용</Label>
            <Select value={passId} onValueChange={setPassId} disabled={!petId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !petId
                      ? "강아지를 먼저 선택하세요"
                      : availablePasses.length === 0
                        ? "적용 가능한 이용권이 없습니다"
                        : "이용권을 선택하세요"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">사용 안 함</SelectItem>
                {availablePasses.length > 0 ? (
                  <SelectItem value="auto">자동 (사용 가능한 이용권)</SelectItem>
                ) : null}
                {availablePasses.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} · 잔여 {p.total_count - p.used_count}회
                    {p.expires_on ? ` · ${p.expires_on}까지` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {!petId
                ? "강아지를 선택하면 보유 이용권을 확인할 수 있습니다."
                : passesQuery.isLoading
                  ? "이용권을 불러오는 중…"
                  : availablePasses.length === 0
                    ? "사용 가능한(결제완료) 이용권이 없습니다."
                    : `사용 가능한 이용권 ${availablePasses.length}건 · 등록 시 1회 차감됩니다.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label>픽드랍 설정</Label>
            <Select
              value={pickupUsageMode}
              onValueChange={(v) => {
                const mode = v as (typeof PICKUP_USAGE_MODES)[number]["value"];
                setPickupUsageMode(mode);
                if (mode === "none") setPickupPassId("none");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PICKUP_USAGE_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pickupUsageMode !== "none" ? (
              <Select value={pickupPassId} onValueChange={setPickupPassId} disabled={!petId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !petId
                        ? "강아지를 먼저 선택하세요"
                        : availablePickupPasses.length === 0
                          ? "적용 가능한 이용권이 없습니다"
                          : "픽드랍 이용권을 선택하세요"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">사용 안 함</SelectItem>
                  {availablePickupPasses.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title} · 잔여 {p.total_count - p.used_count}회
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {selectedPass || selectedPickupPass ? (
            <p className="text-xs text-muted-foreground">
              적용된 이용권은 등록 시 잔여 횟수가 1회 차감됩니다.
            </p>
          ) : null}

          {serviceType === "hotel" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>입실일</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (e.target.value >= endDate) setEndDate(addDays(e.target.value, 1));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>퇴실일</Label>
                  <Input
                    type="date"
                    min={addDays(date, 1)}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-semibold">
                숙박 기간: {stayLabel(date, endDate)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>입실 시간</Label>
                  <Input type="time" value={dropOff} onChange={(e) => setDropOff(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>퇴실 시간</Label>
                  <Input type="time" value={pickUp} onChange={(e) => setPickUp(e.target.value)} />
                </div>
              </div>
            </div>
          ) : serviceType === "grooming" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>시간 (30분 단위)</Label>
                <Select value={slot} onValueChange={setSlot}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROOMING_SLOTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s} ~ {addMinutes(s, 30)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : serviceType === "kindergarten" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>시작일</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (e.target.value > endDate) setEndDate(e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>종료일</Label>
                  <Input
                    type="date"
                    min={date}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>등원</Label>
                  <Input type="time" value={dropOff} onChange={(e) => setDropOff(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>하원</Label>
                  <Input type="time" value={pickUp} onChange={(e) => setPickUp(e.target.value)} />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>날짜 (하루)</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>등원</Label>
                  <Input type="time" value={dropOff} onChange={(e) => setDropOff(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>하원</Label>
                  <Input type="time" value={pickUp} onChange={(e) => setPickUp(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>메모</Label>
            <Textarea
              value={memo}
              maxLength={500}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="약 복용, 픽업 담당자 등"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!petId || hotelInvalid || create.isPending}
            onClick={() => create.mutate()}
          >
            등록하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
