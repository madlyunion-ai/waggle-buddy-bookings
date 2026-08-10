import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { StaffEditDialog } from "@/components/StaffEditDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { listExternalStaff, type ExternalStaff } from "@/lib/projectpet.functions";
import {
  createStaff,
  listLocalStaff,
  type StaffRoleInput as StaffRole,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "직원 관리 | 허그앤멍 예약관리" },
      { name: "description", content: "원장·선생님 계정을 조회하고 신규 직원을 등록합니다." },
      { property: "og:title", content: "직원 관리 | 허그앤멍 예약관리" },
      { property: "og:description", content: "허그앤멍 직원 계정 관리" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffPage,
});

const ROLE_LABELS: Record<string, string> = {
  BRANCH_MANAGER: "원장",
  SUPER_ADMIN: "원장",
  STAFF: "선생님",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "활성",
  INACTIVE: "비활성",
  PENDING_APPROVAL: "승인 대기",
};

function roleLabel(role: string | null) {
  return role ? (ROLE_LABELS[role] ?? role) : "-";
}

function formatPhone(phone: string | null) {
  if (!phone) return "-";
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return phone;
}

type StaffRow = ExternalStaff & { local?: boolean; rawId?: string };

function StaffPage() {
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const fetchStaff = useServerFn(listExternalStaff);
  const fetchLocal = useServerFn(listLocalStaff);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["external-staff"],
    queryFn: () => fetchStaff({ data: { limit: 100 } }),
    retry: false,
  });

  const localQuery = useQuery({
    queryKey: ["local-staff"],
    queryFn: () => fetchLocal({}),
  });

  const localRows: StaffRow[] = (localQuery.data ?? []).map((r) => ({
    id: `local-${r.id}`,
    rawId: r.id,
    name: r.name,
    username: r.username ?? r.email,
    email: r.email,
    phone: r.phone,
    role: r.role,
    status: r.status,
    branchName: r.branchName,
    createdAt: r.createdAt,
    local: true,
  }));

  const externalRows: StaffRow[] = query.isError ? [] : (query.data ?? []);
  const localEmails = new Set(localRows.map((r) => (r.email ?? "").toLowerCase()));

  const rows: StaffRow[] = [
    ...localRows,
    ...externalRows.filter((r) => !localEmails.has((r.email ?? "").toLowerCase())),
  ].filter((row) => {
    const k = keyword.trim().toLowerCase();
    if (!k) return true;
    return [row.name, row.email, row.username, row.phone, roleLabel(row.role)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(k));
  });

  const managers = rows.filter((r) => r.role !== "STAFF").length;

  return (
    <AppShell
      title="직원 관리"
      description={
        <span className="hidden sm:inline">
          원장·선생님 계정을 조회하고 신규 직원을 등록합니다.
        </span>
      }
      action={
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          직원 추가
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="이름, 아이디, 연락처 검색"
            className="bg-white pl-9 placeholder:text-sm"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="hidden sm:inline-flex"
        >
          <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
          새로고침
        </Button>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          총 {rows.length}명 · 원장 {managers}명
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-0 table-fixed text-[11px] sm:min-w-[720px] sm:table-auto sm:text-sm">
            <thead className="bg-secondary/60 text-center text-xs font-bold text-muted-foreground">
              <tr>
                <th className="w-[26%] px-2 py-3 sm:w-auto sm:px-4">이름</th>
                <th className="w-[18%] px-2 py-3 sm:w-auto sm:px-4">구분</th>
                <th className="w-[28%] px-2 py-3 sm:w-auto sm:px-4">아이디</th>
                <th className="hidden px-4 py-3 sm:table-cell">이메일</th>
                <th className="w-[28%] px-2 py-3 sm:w-auto sm:px-4">연락처</th>
                <th className="hidden px-4 py-3 sm:table-cell">상태</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">관리</th>
              </tr>
            </thead>

            <tbody>
              {localQuery.isLoading && query.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    직원 정보를 불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    표시할 직원이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="truncate px-2 py-3 font-semibold sm:px-4">{row.name}</td>
                    <td className="truncate px-2 py-3 sm:px-4">
                      <Badge
                        variant={row.role === "STAFF" ? "secondary" : "default"}
                        className="max-w-full truncate"
                      >
                        {roleLabel(row.role)}
                      </Badge>
                    </td>
                    <td className="truncate px-2 py-3 font-medium sm:px-4">
                      {row.username ?? "-"}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {row.email ?? "-"}
                    </td>

                    <td className="truncate px-2 py-3 text-muted-foreground sm:px-4">
                      {formatPhone(row.phone)}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {row.status ? (STATUS_LABELS[row.status] ?? row.status) : "-"}
                    </td>
                    <td className="hidden px-4 py-3 text-right sm:table-cell">
                      {row.local ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(row)}
                          aria-label="직원 정보 수정"
                        >
                          <Pencil className="size-4" />
                          수정
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewStaffDialog open={open} onOpenChange={setOpen} />
      <StaffEditDialog
        row={editing ? { ...editing, rawId: editing.rawId! } : null}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </AppShell>
  );
}

function NewStaffDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const submit = useServerFn(createStaff);

  const [role, setRole] = useState<StaffRole>("STAFF");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");

  function reset() {
    setRole("STAFF");
    setName("");
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirm("");
    setPhone("");
  }

  const mutation = useMutation({
    mutationFn: () => submit({ data: { name, username, email, password, phone, role } }),
    onSuccess: () => {
      toast.success("직원이 등록되었습니다. 등록한 아이디·비밀번호로 로그인할 수 있습니다.");

      queryClient.invalidateQueries({ queryKey: ["local-staff"] });
      queryClient.invalidateQueries({ queryKey: ["external-staff"] });
      reset();
      onOpenChange(false);
    },

    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "직원 등록에 실패했습니다.");
    },
  });

  function handleSubmit() {
    if (password !== confirm) {
      toast.error("비밀번호가 일치하지 않습니다.");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>직원 추가</DialogTitle>
          <DialogDescription>원장 또는 선생님 계정을 새로 등록합니다.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>구분</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRANCH_MANAGER">원장</SelectItem>
                <SelectItem value="STAFF">선생님</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="staff-name">이름</Label>
            <Input
              id="staff-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              maxLength={100}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="staff-username">아이디</Label>
            <Input
              id="staff-username"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9._-]/g, ""))}
              placeholder="teacher01"
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">
              영문·숫자 3자 이상. 이 아이디로 로그인합니다.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="staff-email">이메일 (선택)</Label>
            <Input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@hugandmung.com"
              maxLength={200}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="staff-pw">비밀번호</Label>
              <Input
                id="staff-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="staff-pw2">비밀번호 확인</Label>
              <Input
                id="staff-pw2"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="다시 입력"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="staff-phone">핸드폰번호</Label>
            <Input
              id="staff-phone"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 11))}
              placeholder="01012345678"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "등록 중…" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
