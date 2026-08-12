import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarIcon, Plus } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  formatWon,
  nightsBetween,
  stayLabel,
  toDateKey,
  type ServiceType,
} from "@/lib/kindergarten";

const PICKUP_USAGE_MODES = [
  { value: "none", label: "사용안함" },
  { value: "pickup", label: "픽업" },
  { value: "dropoff", label: "드랍" },
  { value: "round_trip", label: "왕복" },
] as const;

const WEIGHT_CLASSES = [
  { value: "small", label: "소형" },
  { value: "small_medium", label: "중소형" },
  { value: "medium", label: "중형" },
  { value: "medium_large", label: "중대형" },
  { value: "large", label: "대형" },
] as const;

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}시간 ${minutes}분`;
  if (hours) return `${hours}시간`;
  return `${minutes}분`;
}

function timeToMinutes(time: string) {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 시작일~종료일을 하나의 range date-picker로 선택하는 필드.
 * 팝오버를 열 때마다 선택 상태를 초기화해, 항상 "시작일 클릭 → 종료일 클릭" 2단계로 동작하게 한다.
 * (react-day-picker의 기본 range 동작은 이미 완성된 range가 있으면 시작일이 고정된 채 끝만 바뀌어 요구사항과 달랐다)
 */
function DateRangeField({
  from,
  to,
  onChange,
  minNights = 0,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** 시작일과 종료일을 같은 날로 선택하지 못하게 강제할 최소 박수 (예: 호텔은 1) */
  minNights?: number;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<string | null>(null);
  const fromDate = new Date(`${from}T00:00:00`);

  const displayed: DateRange | undefined = draftFrom
    ? { from: new Date(`${draftFrom}T00:00:00`), to: undefined }
    : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraftFrom(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start bg-white font-normal hover:bg-white"
        >
          <CalendarIcon className="size-4 shrink-0 opacity-60" />
          {from === to ? from : `${from} ~ ${to}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={displayed}
          defaultMonth={fromDate}
          numberOfMonths={1}
          onSelect={(_, selectedDay) => {
            const clickedKey = toDateKey(selectedDay);
            if (!draftFrom) {
              setDraftFrom(clickedKey);
              return;
            }
            if (minNights > 0 && clickedKey === draftFrom) return;
            const nextFrom = draftFrom <= clickedKey ? draftFrom : clickedKey;
            const nextTo = draftFrom <= clickedKey ? clickedKey : draftFrom;
            onChange(nextFrom, nextTo);
            setDraftFrom(null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

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
  const [weightClass, setWeightClass] = useState<string>("small");

  const pricingQuery = useQuery({
    queryKey: ["reservation-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_pricing")
        .select("service_type, weight_class, price");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const unitPrice =
    pricingQuery.data?.find((r) => r.service_type === serviceType && r.weight_class === weightClass)
      ?.price ?? 0;

  const pickupUnitPrice =
    pricingQuery.data?.find(
      (r) => r.service_type === "pickup_dropoff" && r.weight_class === weightClass,
    )?.price ?? 0;

  // 이용권을 적용하면 해당 이용료는 차감되어 총액에서 제외된다
  const passApplied = passId !== "none";
  const pickupPassApplied = pickupUsageMode !== "none" && pickupPassId !== "none";

  const serviceCost = (() => {
    if (passApplied) return 0;
    if (serviceType === "kindergarten") {
      const days = Math.max(1, nightsBetween(date, endDate) + 1);
      return unitPrice * days;
    }
    if (serviceType === "hotel") {
      const nights = Math.max(1, nightsBetween(date, endDate));
      return unitPrice * nights;
    }
    if (serviceType === "daily_care") {
      const hours = Math.max(0, (timeToMinutes(pickUp) - timeToMinutes(dropOff)) / 60);
      return Math.round(unitPrice * hours);
    }
    return unitPrice;
  })();

  const pickupCost = (() => {
    if (pickupUsageMode === "none" || pickupPassApplied) return 0;
    const multiplier = pickupUsageMode === "round_trip" ? 2 : 1;
    return pickupUnitPrice * multiplier;
  })();

  const totalPrice = serviceCost + pickupCost;

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
        weight_class: weightClass || null,
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

      // 이용권 적용 시 차감: 데이케어는 등원~하원 시간(분)만큼, 그 외는 1회
      const deductions: { id: string; amount: number }[] = [];
      if (appliedPassId) {
        const amount =
          serviceType === "daily_care"
            ? Math.max(0, timeToMinutes(pickUp) - timeToMinutes(dropOff))
            : 1;
        deductions.push({ id: appliedPassId, amount });
      }
      if (appliedPickupPassId) {
        deductions.push({ id: appliedPickupPassId, amount: 1 });
      }
      for (const { id, amount } of deductions) {
        if (amount <= 0) continue;
        const { data: applied } = await supabase
          .from("passes")
          .select("used_count, total_count")
          .eq("id", id)
          .maybeSingle();
        if (applied) {
          await supabase
            .from("passes")
            .update({ used_count: Math.min(applied.total_count, applied.used_count + amount) })
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
      if (serviceType === "hotel") {
        const today = toDateKey(new Date());
        setDate(today);
        setEndDate(addDays(today, 1));
      } else {
        setDate(defaultDate);
        setEndDate(serviceType === "kindergarten" ? defaultDate : addDays(defaultDate, 1));
      }
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

      <DialogContent>
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
                    if (t === "hotel") {
                      const today = toDateKey(new Date());
                      setDate(today);
                      setEndDate(addDays(today, 1));
                    }
                  }}
                >
                  {SERVICE_LABELS[t]}
                </Button>
              ))}
            </div>
          </div>

          {usingKnownDog ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-sm font-bold">
                {initialPetName ?? "선택한 반려견"} 반려견으로 예약을 등록합니다.
              </div>
              <div className="space-y-2">
                <Label>반려견 체중</Label>
                <Select value={weightClass} onValueChange={setWeightClass}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEIGHT_CLASSES.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

              <div className="grid grid-cols-2 gap-3">
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
                <div className="space-y-2">
                  <Label>반려견 체중</Label>
                  <Select value={weightClass} onValueChange={setWeightClass}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHT_CLASSES.map((w) => (
                        <SelectItem key={w.value} value={w.value}>
                          {w.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {serviceType === "hotel" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>날짜</Label>
                  <DateRangeField
                    from={date}
                    to={endDate}
                    minNights={1}
                    onChange={(f, t) => {
                      setDate(f);
                      setEndDate(t);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>입실 / 퇴실 시간</Label>
                  <div className="flex gap-2">
                    <Input
                      type="time"
                      value={dropOff}
                      onChange={(e) => setDropOff(e.target.value)}
                    />
                    <Input type="time" value={pickUp} onChange={(e) => setPickUp(e.target.value)} />
                  </div>
                </div>
              </div>
              <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-semibold">
                숙박 기간: {stayLabel(date, endDate)}
              </p>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>날짜</Label>
                <DateRangeField
                  from={date}
                  to={endDate}
                  onChange={(f, t) => {
                    setDate(f);
                    setEndDate(t);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>등원 / 하원</Label>
                <div className="flex gap-2">
                  <Input type="time" value={dropOff} onChange={(e) => setDropOff(e.target.value)} />
                  <Input type="time" value={pickUp} onChange={(e) => setPickUp(e.target.value)} />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>등원 / 하원</Label>
                <div className="flex gap-2">
                  <Input type="time" value={dropOff} onChange={(e) => setDropOff(e.target.value)} />
                  <Input type="time" value={pickUp} onChange={(e) => setPickUp(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
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
                      {p.title} · 잔여{" "}
                      {serviceType === "daily_care"
                        ? formatDuration(p.total_count - p.used_count)
                        : `${p.total_count - p.used_count}회`}
                      {p.expires_on ? ` · ${p.expires_on}까지` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {petId ? (
                <p className="text-xs text-muted-foreground">
                  {passesQuery.isLoading
                    ? "이용권을 불러오는 중…"
                    : availablePasses.length === 0
                      ? "사용 가능한(결제완료) 이용권이 없습니다."
                      : serviceType === "daily_care"
                        ? "등원~하원 시간만큼 차감됩니다."
                        : "등록 시 1회 차감됩니다."}
                </p>
              ) : null}
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
          </div>

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
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2.5 text-sm font-bold">
              <span>총액</span>
              <span className="flex items-baseline gap-2">
                {pickupCost > 0 ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    이용료 {formatWon(serviceCost)} + 픽드랍비 {formatWon(pickupCost)}
                  </span>
                ) : null}
                <span className="text-primary">{formatWon(totalPrice)}</span>
              </span>
            </div>
            <Button
              className="w-full"
              disabled={!petId || hotelInvalid || create.isPending}
              onClick={() => create.mutate()}
            >
              등록하기
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
