import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
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
import type { ExternalPet } from "@/lib/projectpet.functions";
import {
  GROOMING_SLOTS,
  SERVICE_LABELS,
  SERVICE_TYPES,
  addDays,
  addMinutes,
  nightsBetween,
  stayLabel,
  toDateKey,
  type ServiceType,
} from "@/lib/kindergarten";

/** 외부 API 반려견을 내부 DB와 동기화한 뒤 예약을 생성하는 다이얼로그 */
export function ReserveDialog({ pet }: { pet: ExternalPet }) {
  const queryClient = useQueryClient();
  const today = toDateKey(new Date());
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType>("kindergarten");
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(() => addDays(today, 1));
  const [dropOff, setDropOff] = useState("09:00");
  const [pickUp, setPickUp] = useState("18:00");
  const [slot, setSlot] = useState("10:00");
  const [memo, setMemo] = useState("");

  const ownerName = pet.ownerNames[0] ?? "보호자 미확인";

  const create = useMutation({
    mutationFn: async () => {
      // 보호자 동기화
      const externalOwnerId = pet.ownerId ?? `pet-${pet.id}`;
      const { data: existingOwner } = await supabase
        .from("owners")
        .select("id")
        .eq("external_id", externalOwnerId)
        .maybeSingle();
      let ownerId = existingOwner?.id ?? null;
      if (!ownerId) {
        const { data: inserted, error } = await supabase
          .from("owners")
          .insert({
            name: ownerName,
            phone: pet.ownerPhone ?? "-",
            external_id: externalOwnerId,
            external_source: "owner",
          })
          .select("id")
          .single();
        if (error) throw error;
        ownerId = inserted.id;
      }

      // 반려견 동기화
      const { data: existingDog } = await supabase
        .from("dogs")
        .select("id")
        .eq("external_id", pet.id)
        .maybeSingle();
      let dogId = existingDog?.id ?? null;
      if (!dogId) {
        const { data: insertedDog, error } = await supabase
          .from("dogs")
          .insert({
            owner_id: ownerId,
            name: pet.name,
            breed: pet.breed,
            birth_date: pet.birthDate,
            weight_kg: pet.weight,
            gender: pet.gender === "male" || pet.gender === "female" ? pet.gender : "unknown",
            neutered: pet.neutered,
            external_id: pet.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        dogId = insertedDog.id;
      }

      const { data: passes } = await supabase
        .from("passes")
        .select("id, total_count, used_count")
        .eq("dog_id", dogId)
        .eq("payment_status", "paid")
        .order("purchased_on", { ascending: true });
      const usable = (passes ?? []).find((p) => p.used_count < p.total_count);

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
        pass_id: serviceType === "kindergarten" ? (usable?.id ?? null) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
      toast.success(`${pet.name} 예약을 등록했습니다`);
      setOpen(false);
      setMemo("");
    },
    onError: (e: Error) => toast.error("예약 등록에 실패했습니다", { description: e.message }),
  });

  const hotelInvalid = serviceType === "hotel" && nightsBetween(date, endDate) < 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs">
          <CalendarPlus className="size-3.5" /> 예약하기
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pet.name} 예약</DialogTitle>
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
          <Button disabled={hotelInvalid || create.isPending} onClick={() => create.mutate()}>
            예약 등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
