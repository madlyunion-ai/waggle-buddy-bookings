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
  ownerNames: string[];
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
  owners?: Array<{ name?: string; realname?: string }>;
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
  return {
    id: String(dto.id),
    name: dto.name || "이름 없음",
    breed: dto.breed?.nameKo ?? dto.breed?.name ?? null,
    birthDate: dto.birthDate ? dto.birthDate.slice(0, 10) : null,
    weight: typeof dto.weight === "number" ? dto.weight : null,
    ownerNames: (dto.owners ?? []).map((o) => o.name || o.realname || "").filter(Boolean),
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
      apiGet<{ owners?: OwnerDto[] }>("/owners", params),
      apiGet<{ data?: { users?: UserDto[] } }>("/users", params),
    ]);

    const list: ExternalMember[] = [];
    if (owners.status === "fulfilled") {
      list.push(...(owners.value.owners ?? []).map((o) => mapMember(o, "owner")));
    }
    if (users.status === "fulfilled") {
      list.push(...(users.value.data?.users ?? []).map((u) => mapMember(u, "user")));
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
