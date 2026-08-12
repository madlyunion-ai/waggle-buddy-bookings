import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listExternalMembers } from "@/lib/projectpet.functions";
import type { ExternalPet } from "@/lib/projectpet.functions";

type Props = { pet: ExternalPet };

export function OwnerInfoDialog({ pet }: Props) {
  const [open, setOpen] = useState(false);
  const ownerName = pet.ownerNames[0] ?? "";
  const fetchMembers = useServerFn(listExternalMembers);

  const memberQuery = useQuery({
    queryKey: ["external-member-detail", pet.ownerId, ownerName],
    queryFn: () => fetchMembers({ data: { search: ownerName || pet.ownerPhone || "", limit: 20 } }),
    enabled: open && Boolean(ownerName || pet.ownerPhone),
  });

  const member =
    memberQuery.data?.find((m) => (pet.ownerId ? m.id === pet.ownerId : false)) ??
    memberQuery.data?.find((m) => m.name === ownerName) ??
    null;

  const rows: Array<{ label: string; value: string }> = [
    { label: "보호자명", value: member?.name || ownerName || "미확인" },
    { label: "연락처", value: member?.phone || pet.ownerPhone || "미입력" },
    { label: "이메일", value: member?.email || "미입력" },
    { label: "소속 지점", value: member?.branchName || "미입력" },
    {
      label: "회원 구분",
      value: member ? (member.source === "owner" ? "견주 회원" : "일반 사용자") : "미확인",
    },
    { label: "회원 ID", value: member?.id || pet.ownerId || "미확인" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-primary"
          aria-label={`${ownerName || "보호자"} 정보 보기`}
        >
          <Search className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>보호자 정보</DialogTitle>
        </DialogHeader>

        {memberQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : (
          <div className="space-y-3">
            <dl className="divide-y divide-border rounded-xl border border-border">
              {rows.map((row) => (
                <div key={row.label} className="px-4 py-2.5 text-sm">
                  <dt className="text-xs font-semibold text-muted-foreground">{row.label}</dt>
                  <dd className="mt-0.5 truncate font-bold">{row.value}</dd>
                </div>
              ))}
            </dl>

            {pet.ownerNames.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">공동 보호자</span>
                {pet.ownerNames.slice(1).map((name) => (
                  <Badge key={name} variant="outline" className="text-[11px]">
                    {name}
                  </Badge>
                ))}
              </div>
            ) : null}

            {memberQuery.isError ? (
              <p className="text-xs font-semibold text-destructive">
                회원 상세 정보를 불러오지 못해 반려견 정보 기준으로 표시했습니다.
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
