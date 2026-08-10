import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

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

export function NewReservationDialog({
  defaultDate,
  open: openProp,
  onOpenChange,
  hideTrigger,
}: {
  defaultDate: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const queryClient = useQueryClient();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

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

  const fetchMembers = useServerFn(listExternalMembers);
  const fetchPets = useServerFn(listExternalPets);

  const membersQuery = useQuery({
    queryKey: ["external-members", memberSearch],
    queryFn: () => fetchMembers({ data: { search: memberSearch, limit: 30 } }),
    enabled: open,
  });

  const member = (membersQuery.data ?? []).find((m) => m.id === memberId) ?? null;

  const petsQuery = useQuery({
    queryKey: ["external-pets", memberId, member?.source ?? "owner"],
    queryFn: () =>
      fetchPets({
        data: { memberId, source: member?.source ?? "owner", search: member?.name ?? "" },
      }),
    enabled: open && !!memberId,
  });

  const pet = (petsQuery.data ?? []).find((p) => p.id === petId) ?? null;

  // 선택한 반려견의 내부 이용권 목록 (동기화된 강아지 기준)
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
        .select("id, title, total_count, used_count, payment_status, expires_on")
        .eq("dog_id", dog.id)
        .order("purchased_on", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!petId,
  });

  const availablePasses = (passesQuery.data ?? []).filter(
    (p) => p.payment_status === "paid" && p.used_count < p.total_count,
  );

  const create = useMutation({
    mutationFn: async () => {
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
      let dogId = existingDog?.id ?? null;
      if (!dogId) {
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
        dogId = insertedDog.id;
      }

      // 이용권 적용: 사용자가 선택한 이용권이 있으면 그것을 사용, "자동"이면 사용 가능한 이용권을 사용
      let appliedPassId: string | null = null;
      if (passId !== "none") {
        if (passId === "auto") {
          const { data: pass } = await supabase
            .from("passes")
            .select("id, total_count, used_count")
            .eq("dog_id", dogId)
            .eq("payment_status", "paid")
            .order("purchased_on", { ascending: true });
          appliedPassId = (pass ?? []).find((p) => p.used_count < p.total_count)?.id ?? null;
        } else {
          appliedPassId = passId;
        }
      }

      const times =
        serviceType === "grooming"
          ? { drop_off_time: slot, pick_up_time: addMinutes(slot, 30) }
          : { drop_off_time: dropOff, pick_up_time: pickUp };

      const { error } = await supabase.from("reservations").insert({
        dog_id: dogId,
        service_type: serviceType,
        reserved_date: date,
        end_date: serviceType === "hotel" ? endDate : null,
        ...times,
        memo: memo || null,
        pass_id: appliedPassId,
      });
      if (error) throw error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["passes"] });
      toast.success("예약을 등록했습니다");
      setOpen(false);
      setMemo("");
      setPetId("");
      setPassId("none");
    },
    onError: (e: Error) => toast.error("예약 등록에 실패했습니다", { description: e.message }),
  });

  const hotelInvalid = serviceType === "hotel" && nightsBetween(date, endDate) < 1;

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setEndDate(addDays(defaultDate, 1));
    }
  }, [open, defaultDate]);

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
          <DialogDescription>
            예약 타입에 따라 날짜와 시간 입력 방식이 달라집니다.
          </DialogDescription>
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
                  onClick={() => setServiceType(t)}
                >
                  {SERVICE_LABELS[t]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>회원 검색</Label>
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
                  placeholder={membersQuery.isLoading ? "회원을 불러오는 중…" : "회원을 선택하세요"}
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
            <Label>이용권 적용</Label>
            <Select value={passId} onValueChange={setPassId} disabled={!petId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={!petId ? "강아지를 먼저 선택하세요" : "이용권을 선택하세요"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">사용 안 함</SelectItem>
                <SelectItem value="auto">자동 (사용 가능한 이용권)</SelectItem>
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
                    : `사용 가능한 이용권 ${availablePasses.length}건 · 등원 처리 시 1회 차감됩니다.`}
            </p>
          </div>

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
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>날짜{serviceType === "daily_care" ? " (하루)" : ""}</Label>
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
