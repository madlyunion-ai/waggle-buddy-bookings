import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LocalStaff = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  branchName: string | null;
  createdAt: string | null;
};

export type StaffRoleInput = "BRANCH_MANAGER" | "STAFF";

export type CurrentStaffProfile = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  branchName: string | null;
};

/**
 * 현재 로그인한 계정의 직원 정보 (Supabase 인증 이메일 기준으로 staff 테이블 조회).
 * 이 앱의 로그인은 항상 staff 테이블의 계정으로만 이루어지므로, 정상적인 경우
 * 결과가 null이 되는 일은 없다. null은 SNB에서 "정보 수정" 아이콘을 감추는 신호로 쓰인다.
 */
export const getCurrentStaffProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CurrentStaffProfile | null> => {
    const email = typeof context.claims["email"] === "string" ? (context.claims["email"] as string) : null;
    if (!email) return null;

    const { data, error } = await context.supabase
      .from("staff")
      .select("id, name, username, email, phone, role, status, branch_name")
      .ilike("email", email)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      username: data.username,
      email: data.email,
      phone: data.phone,
      role: data.role,
      status: data.status,
      branchName: data.branch_name,
    };
  });

/** 내부 DB 직원 목록 */
export const listLocalStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LocalStaff[]> => {
    const { data, error } = await context.supabase
      .from("staff")
      .select("id, name, username, email, phone, role, status, branch_name, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      email: r.email,
      phone: r.phone,
      role: r.role,
      status: r.status,
      branchName: r.branch_name,
      createdAt: r.created_at,
    }));
  });


/** 직원 등록: DB에 저장하고, 외부 API 연동은 선택적으로 시도 */
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      username: string;
      email?: string;
      password: string;
      phone: string;
      role: StaffRoleInput;
    }) => {
      const name = String(input?.name ?? "").trim().slice(0, 100);
      const username = String(input?.username ?? "").trim().slice(0, 50);
      const rawEmail = String(input?.email ?? "").trim().slice(0, 200);
      const password = String(input?.password ?? "");
      const phone = String(input?.phone ?? "").replace(/[^0-9]/g, "").slice(0, 11);
      const role: StaffRoleInput = input?.role === "BRANCH_MANAGER" ? "BRANCH_MANAGER" : "STAFF";
      if (!name) throw new Error("이름을 입력해 주세요.");
      if (!/^[A-Za-z0-9._-]{3,50}$/.test(username))
        throw new Error("아이디는 영문·숫자 3자 이상으로 입력해 주세요.");
      const email = rawEmail || `${username.toLowerCase()}@hugandmung.kr`;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("올바른 이메일을 입력해 주세요.");
      if (password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");
      if (phone.length < 10) throw new Error("휴대폰 번호를 정확히 입력해 주세요.");
      return { name, username, email, password, phone, role };
    },
  )

  .handler(async ({ data, context }): Promise<{ id: string; externalSynced: boolean; loginEnabled: boolean }> => {
    let externalId: string | null = null;
    try {
      const { apiPost } = await import("./projectpet.server");
      const res = await apiPost<{ id?: string | number; data?: { id?: string | number } }>(
        "/mobile/users",
        {
          username: data.username,
          email: data.email,
          password: data.password,
          name: data.name,
          realname: data.name,
          phoneNumber: data.phone,
          role: data.role,
          status: "ACTIVE",
        },
      );
      const rawId = res.id ?? res.data?.id;
      if (rawId !== undefined && rawId !== null) externalId = String(rawId);
    } catch (e) {
      console.error("ProjectPet staff create failed (saved locally only):", e);
    }

    // 사이트 로그인 계정 생성 (이메일 확인 없이 즉시 로그인 가능)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name, phone: data.phone, staff_role: data.role },
    });
    if (authError) {
      if (/already|registered|exists/i.test(authError.message)) {
        // 이미 존재하는 계정이면 비밀번호를 입력값으로 재설정해 로그인 가능하게 만든다
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = list?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
        );
        if (existing) {
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password: data.password,
            email_confirm: true,
          });
          if (updErr) throw new Error(`로그인 계정 갱신에 실패했습니다: ${updErr.message}`);
        }
      } else {
        throw new Error(`로그인 계정 생성에 실패했습니다: ${authError.message}`);
      }
    }

    const { data: row, error } = await context.supabase
      .from("staff")
      .insert({
        name: data.name,
        username: data.username,
        email: data.email,
        phone: data.phone,
        role: data.role,
        status: "ACTIVE",
        external_id: externalId,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        // 이미 등록된 이메일이면 기존 직원 정보를 갱신 (비밀번호는 위에서 재설정됨)
        const { data: updated, error: updErr } = await context.supabase
          .from("staff")
          .update({
            name: data.name,
            username: data.username,
            phone: data.phone,
            role: data.role,
            status: "ACTIVE",
          })
          .eq("email", data.email)
          .select("id")
          .single();
        if (updErr) throw new Error(updErr.message);
        return { id: updated.id, externalSynced: externalId !== null, loginEnabled: true };
      }
      throw new Error(error.message);
    }


    return { id: row.id, externalSynced: externalId !== null, loginEnabled: true };
  });


/** 내부 DB 직원 정보 수정 (이름/아이디/이메일/연락처/구분/상태, 비밀번호는 입력 시에만 변경) */
export const updateLocalStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      name: string;
      username: string;
      email: string;
      phone: string;
      role: StaffRoleInput;
      status: "ACTIVE" | "INACTIVE";
      password?: string | undefined;
    }) => {
      const id = String(input?.id ?? "").trim();
      const name = String(input?.name ?? "").trim().slice(0, 100);
      const username = String(input?.username ?? "").trim().slice(0, 50);
      const email = String(input?.email ?? "").trim().slice(0, 200);
      const phone = String(input?.phone ?? "").replace(/[^0-9]/g, "").slice(0, 11);
      const role: StaffRoleInput = input?.role === "BRANCH_MANAGER" ? "BRANCH_MANAGER" : "STAFF";
      const status = input?.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
      const password = String(input?.password ?? "");
      if (!id) throw new Error("대상을 확인할 수 없습니다.");
      if (!name) throw new Error("이름을 입력해 주세요.");
      if (!/^[A-Za-z0-9._-]{3,50}$/.test(username))
        throw new Error("아이디는 영문·숫자 3자 이상으로 입력해 주세요.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("올바른 이메일을 입력해 주세요.");
      if (phone.length < 10) throw new Error("휴대폰 번호를 정확히 입력해 주세요.");
      if (password && password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");
      return { id, name, username, email, phone, role, status, password };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: current, error: curErr } = await context.supabase
      .from("staff")
      .select("email")
      .eq("id", data.id)
      .single();
    if (curErr) throw new Error(curErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) throw new Error(`로그인 계정 조회에 실패했습니다: ${listErr.message}`);
    const authUser = list?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === current.email.toLowerCase(),
    );

    if (authUser) {
      const updates: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {
        user_metadata: { full_name: data.name, phone: data.phone, staff_role: data.role },
      };
      if (data.email.toLowerCase() !== current.email.toLowerCase()) updates.email = data.email;
      if (data.password) updates.password = data.password;
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, updates);
      if (updErr) throw new Error(`로그인 계정 갱신에 실패했습니다: ${updErr.message}`);
    }

    const { error } = await context.supabase
      .from("staff")
      .update({
        name: data.name,
        username: data.username,
        email: data.email,
        phone: data.phone,
        role: data.role,
        status: data.status,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/** 내부 DB 직원 삭제 (로그인 계정도 함께 삭제) */
export const deleteLocalStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { data: current, error: curErr } = await context.supabase
      .from("staff")
      .select("email")
      .eq("id", data.id)
      .single();
    if (curErr) throw new Error(curErr.message);

    const { error } = await context.supabase.from("staff").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const authUser = list?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === current.email.toLowerCase(),
      );
      if (authUser) await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    } catch (e) {
      console.error("로그인 계정 삭제 실패 (직원 레코드는 삭제됨):", e);
    }

    return { ok: true };
  });
