import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteLocalStaff, updateLocalStaff, type StaffRoleInput as StaffRole } from "@/lib/staff.functions";

export type EditableStaffRow = {
  id: string;
  rawId: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
};

export function StaffEditDialog({
  row,
  onOpenChange,
}: {
  row: EditableStaffRow | null;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const submit = useServerFn(updateLocalStaff);
  const removeLocal = useServerFn(deleteLocalStaff);

  const [role, setRole] = useState<StaffRole>("STAFF");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const open = row !== null;

  // 대상이 바뀔 때마다 폼을 해당 직원 정보로 초기화
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (row && loadedFor !== row.id) {
    setLoadedFor(row.id);
    setRole(row.role === "BRANCH_MANAGER" ? "BRANCH_MANAGER" : "STAFF");
    setStatus(row.status === "INACTIVE" ? "INACTIVE" : "ACTIVE");
    setName(row.name);
    setUsername(row.username ?? "");
    setEmail(row.email ?? "");
    setPhone(row.phone ?? "");
    setPassword("");
    setConfirm("");
  }

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["local-staff"] });
    queryClient.invalidateQueries({ queryKey: ["current-staff-profile"] });
  }

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          id: row!.rawId,
          name,
          username,
          email,
          phone,
          role,
          status,
          password: password || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("직원 정보가 수정되었습니다.");
      invalidateAll();
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "수정에 실패했습니다.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeLocal({ data: { id: row!.rawId } }),
    onSuccess: () => {
      toast.success("직원이 삭제되었습니다.");
      invalidateAll();
      setConfirmDeleteOpen(false);
      onOpenChange(false);
    },
    onError: () => toast.error("삭제에 실패했습니다."),
  });

  function handleSubmit() {
    if (password && password !== confirm) {
      toast.error("비밀번호가 일치하지 않습니다.");
      return;
    }
    mutation.mutate();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>직원 정보 수정</DialogTitle>
            <DialogDescription>이 시스템에서 직접 등록한 직원만 수정할 수 있습니다.</DialogDescription>
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
              <Label>상태</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "ACTIVE" | "INACTIVE")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">활성</SelectItem>
                  <SelectItem value="INACTIVE">비활성</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="edit-staff-name">이름</Label>
              <Input
                id="edit-staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="edit-staff-username">아이디</Label>
              <Input
                id="edit-staff-username"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9._-]/g, ""))}
                maxLength={50}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="edit-staff-email">이메일</Label>
              <Input
                id="edit-staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="edit-staff-phone">핸드폰번호</Label>
              <Input
                id="edit-staff-phone"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 11))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-staff-pw">새 비밀번호</Label>
                <Input
                  id="edit-staff-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="변경 시에만 입력"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-staff-pw2">새 비밀번호 확인</Label>
                <Input
                  id="edit-staff-pw2"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="다시 입력"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">비밀번호를 비워두면 기존 비밀번호가 유지됩니다.</p>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteMutation.isPending}
            >
              삭제
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button onClick={handleSubmit} disabled={mutation.isPending}>
                {mutation.isPending ? "저장 중…" : "저장"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>직원을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {row?.name} 님의 정보와 로그인 계정이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "삭제 중…" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
