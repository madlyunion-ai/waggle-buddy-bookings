import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExternalMember = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: "owner" | "user";
  role: string | null;
  branchName: string | null;
};

export type ExternalPet = {
  id: string;
  name: string;
  breed: string | null;
  birthDate: string | null;
  weight: number | null;
  gender: string | null;
  neutered: boolean;
  ownerNames: string[];
  ownerId: string | null;
  ownerPhone: string | null;
};

type OwnerDto = {
  id: string;
  name?: string;
  realname?: string;
  phoneNumber?: string;
  email?: string;
  role?: string;
  branchName?: string;
};

type UserDto = OwnerDto & { username?: string };

type PetDto = {
  id: string;
  name?: string;
  breed?: { name?: string; nameKo?: string } | null;
  birthDate?: string;
  weight?: number | string;
  gender?: string;
  neutered?: boolean | "YES" | "NO" | string;
  isNeutered?: boolean | "YES" | "NO" | string;
  owners?: Array<{ id?: string | number; name?: string; realname?: string; phoneNumber?: string }>;
};

function parseNeutered(value: boolean | string | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toUpperCase() === "YES";
  return false;
}

function mapMember(dto: OwnerDto, source: "owner" | "user"): ExternalMember {
  return {
    id: String(dto.id),
    name: dto.name || dto.realname || (dto as UserDto).username || "이름 없음",
    phone: dto.phoneNumber ?? null,
    email: dto.email ?? null,
    source,
    role: dto.role ?? null,
    branchName: dto.branchName ?? null,
  };
}

function mapPet(dto: PetDto): ExternalPet {
  const owner = (dto.owners ?? [])[0];
  return {
    id: String(dto.id),
    name: dto.name || "이름 없음",
    breed: dto.breed?.nameKo ?? dto.breed?.name ?? null,
    birthDate: dto.birthDate ? dto.birthDate.slice(0, 10) : null,
    weight: dto.weight !== undefined && dto.weight !== null && !Number.isNaN(Number(dto.weight)) ? Number(dto.weight) : null,
    gender: dto.gender ? String(dto.gender).toLowerCase() : null,
    neutered: parseNeutered(dto.neutered ?? dto.isNeutered),
    ownerNames: (dto.owners ?? []).map((o) => o.name || o.realname || "").filter(Boolean),
    ownerId: owner?.id !== undefined && owner?.id !== null ? String(owner.id) : null,
    ownerPhone: owner?.phoneNumber ?? null,
  };
}

/** 외부 API 회원 목록 조회 (견주 + 사용자) */
export const listExternalMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; limit?: number }) => ({
    search: typeof input?.search === "string" ? input.search.slice(0, 100) : "",
    limit: Math.min(Math.max(Number(input?.limit) || 20, 1), 50),
  }))
  .handler(async ({ data }): Promise<ExternalMember[]> => {
    const { apiGet } = await import("./projectpet.server");
    const params = { page: 1, limit: data.limit, search: data.search || undefined };

    const [owners, users] = await Promise.allSettled([
      apiGet<{ owners?: OwnerDto[]; data?: { owners?: OwnerDto[] } }>("/owners", params),
      apiGet<{ users?: UserDto[]; data?: { users?: UserDto[] } }>("/users", params),
    ]);

    const list: ExternalMember[] = [];
    if (owners.status === "fulfilled") {
      const rows = owners.value.owners ?? owners.value.data?.owners ?? [];
      list.push(...rows.map((o) => mapMember(o, "owner")));
    } else {
      console.error("ProjectPet owners fetch failed:", owners.reason);
    }
    if (users.status === "fulfilled") {
      const rows = users.value.users ?? users.value.data?.users ?? [];
      list.push(...rows.map((u) => mapMember(u, "user")));
    } else {
      console.error("ProjectPet users fetch failed:", users.reason);
    }

    if (!list.length && owners.status === "rejected" && users.status === "rejected") {
      throw new Error("외부 회원 목록을 불러올 수 없습니다.");
    }
    return list;
  });

/** 외부 API 반려견 목록 조회 (회원 선택 시 해당 회원의 반려견) */
export const listExternalPets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { memberId?: string; source?: string; search?: string }) => ({
    memberId: typeof input?.memberId === "string" ? input.memberId.slice(0, 100) : "",
    source: input?.source === "user" ? "user" : "owner",
    search: typeof input?.search === "string" ? input.search.slice(0, 100) : "",
  }))
  .handler(async ({ data }): Promise<ExternalPet[]> => {
    const { apiGet } = await import("./projectpet.server");

    if (data.source === "owner" && data.memberId) {
      const owner = await apiGet<{ pets?: PetDto[]; data?: { pets?: PetDto[] } }>(`/owners/${data.memberId}`);
      const pets = owner.pets ?? owner.data?.pets ?? [];
      if (pets.length) return pets.map(mapPet);
    }

    const res = await apiGet<{ data?: { pets?: PetDto[] } }>("/pets", {
      page: 1,
      limit: 50,
      search: data.search || undefined,
    });
    return (res.data?.pets ?? []).map(mapPet);
  });

/** 외부 API 전체 반려견 목록 조회 (검색/페이지) */
export const listAllExternalPets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; page?: number; limit?: number }) => ({
    search: typeof input?.search === "string" ? input.search.slice(0, 100) : "",
    page: Math.min(Math.max(Number(input?.page) || 1, 1), 500),
    limit: Math.min(Math.max(Number(input?.limit) || 50, 1), 100),
  }))
  .handler(async ({ data }): Promise<{ pets: ExternalPet[]; total: number }> => {
    const { apiGet } = await import("./projectpet.server");
    const res = await apiGet<{
      total?: number;
      pets?: PetDto[];
      data?: { pets?: PetDto[]; total?: number; totalCount?: number; meta?: { total?: number } };
    }>("/pets", { page: data.page, limit: data.limit, search: data.search || undefined });

    const rows = res.data?.pets ?? res.pets ?? [];
    const total = res.data?.total ?? res.data?.totalCount ?? res.data?.meta?.total ?? res.total ?? rows.length;
    return { pets: rows.map(mapPet), total };
  });

export type ExternalProfile = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  branchName: string | null;
  branchId: string | null;
  avatarUrl: string | null;
};


/** 외부 API 로그인 사용자 정보 조회 (/auth/profile) */
export const getExternalProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ExternalProfile | null> => {
    const { apiGet } = await import("./projectpet.server");
    try {
      const res = await apiGet<
        Record<string, unknown> & { data?: Record<string, unknown>; user?: Record<string, unknown> }
      >("/auth/profile");
      const dto = (res.data ?? res.user ?? res) as Record<string, unknown>;
      const str = (k: string) => (typeof dto[k] === "string" ? (dto[k] as string) : null);
      const branch = dto["branch"] as { id?: string | number; name?: string } | undefined;
      const branchIdRaw = dto["branchId"] ?? dto["branch_id"] ?? branch?.id ?? null;
      return {
        id: String(dto["id"] ?? ""),
        name: str("realname") || str("name") || str("username") || "사용자",
        username: str("username"),
        email: str("email"),
        phone: str("phoneNumber"),
        role: str("role"),
        branchName: str("branchName") ?? branch?.name ?? null,
        branchId:
          branchIdRaw === null || branchIdRaw === undefined || branchIdRaw === ""
            ? null
            : String(branchIdRaw),
        avatarUrl: str("profileImageUrl") ?? str("avatarUrl") ?? str("photoUrl"),
      };

    } catch (e) {
      console.error("ProjectPet profile fetch failed:", e);
      return null;
    }
  });

export type StaffRole = "BRANCH_MANAGER" | "STAFF";

export type ExternalStaff = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  branchName: string | null;
  createdAt: string | null;
};

type StaffDto = {
  id: string | number;
  name?: string;
  realname?: string;
  username?: string;
  email?: string;
  phoneNumber?: string;
  role?: string;
  status?: string;
  branchName?: string;
  branch?: { name?: string } | null;
  createdAt?: string;
  created_at?: string;
};

function mapStaff(dto: StaffDto): ExternalStaff {
  return {
    id: String(dto.id),
    name: dto.realname || dto.name || dto.username || "이름 없음",
    username: dto.username ?? null,
    email: dto.email ?? null,
    phone: dto.phoneNumber ?? null,
    role: dto.role ?? null,
    status: dto.status ?? null,
    branchName: dto.branchName ?? dto.branch?.name ?? null,
    createdAt: dto.createdAt ?? dto.created_at ?? null,
  };
}

/** 외부 API 직원(사용자) 목록 조회 */
export const listExternalStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; limit?: number }) => ({
    search: typeof input?.search === "string" ? input.search.slice(0, 100) : "",
    limit: Math.min(Math.max(Number(input?.limit) || 100, 1), 100),
  }))
  .handler(async ({ data }): Promise<ExternalStaff[]> => {
    const { apiGet } = await import("./projectpet.server");
    const res = await apiGet<{ users?: StaffDto[]; data?: { users?: StaffDto[] } }>("/users", {
      page: 1,
      limit: data.limit,
      search: data.search || undefined,
    });
    const rows = res.users ?? res.data?.users ?? [];
    return rows.map(mapStaff).filter((s) => s.role !== "OWNER");
  });

/** 외부 API 직원 신규 등록 */
export const createExternalStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { name: string; email: string; password: string; phone: string; role: StaffRole }) => {
      const name = String(input?.name ?? "").trim().slice(0, 100);
      const email = String(input?.email ?? "").trim().slice(0, 200);
      const password = String(input?.password ?? "");
      const phone = String(input?.phone ?? "").replace(/[^0-9]/g, "").slice(0, 11);
      const role: StaffRole = input?.role === "BRANCH_MANAGER" ? "BRANCH_MANAGER" : "STAFF";
      if (!name) throw new Error("이름을 입력해 주세요.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("올바른 이메일을 입력해 주세요.");
      if (password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");
      if (phone.length < 10) throw new Error("휴대폰 번호를 정확히 입력해 주세요.");
      return { name, email, password, phone, role };
    },
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { apiGet, apiPost } = await import("./projectpet.server");

    let branchId: number | undefined;
    try {
      const profile = await apiGet<Record<string, unknown> & { data?: Record<string, unknown> }>(
        "/auth/profile",
      );
      const dto = (profile.data ?? profile) as Record<string, unknown>;
      const branch = dto["branch"] as { id?: string | number } | undefined;
      const raw = dto["branchId"] ?? dto["branch_id"] ?? branch?.id;
      if (raw !== undefined && raw !== null && raw !== "") branchId = Number(raw);
    } catch (e) {
      console.error("ProjectPet profile fetch for staff create failed:", e);
    }

    const res = await apiPost<{ id?: string | number; data?: { id?: string | number } }>("/mobile/users", {
      username: data.email,
      email: data.email,
      password: data.password,
      name: data.name,
      realname: data.name,
      phoneNumber: data.phone,
      role: data.role,
      status: "ACTIVE",
      ...(branchId !== undefined && Number.isFinite(branchId) ? { branchId } : {}),
    });

    const id = res.id ?? res.data?.id ?? "";
    return { id: String(id) };
  });
