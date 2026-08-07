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
  weight?: number;
  gender?: string;
  neutered?: boolean;
  isNeutered?: boolean;
  owners?: Array<{ id?: string | number; name?: string; realname?: string; phoneNumber?: string }>;
};

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
    weight: typeof dto.weight === "number" ? dto.weight : null,
    gender: dto.gender ? String(dto.gender).toLowerCase() : null,
    neutered: Boolean(dto.neutered ?? dto.isNeutered ?? false),
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
      const branch = dto["branch"] as { name?: string } | undefined;
      return {
        id: String(dto["id"] ?? ""),
        name: str("realname") || str("name") || str("username") || "사용자",
        username: str("username"),
        email: str("email"),
        phone: str("phoneNumber"),
        role: str("role"),
        branchName: str("branchName") ?? branch?.name ?? null,
        avatarUrl: str("profileImageUrl") ?? str("avatarUrl") ?? str("photoUrl"),
      };
    } catch (e) {
      console.error("ProjectPet profile fetch failed:", e);
      return null;
    }
  });
