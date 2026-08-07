import { apiGet } from "./projectpet.server";

export type SyncPet = {
  externalId: string;
  name: string;
  breed: string | null;
  birthDate: string | null;
  weight: number | null;
  gender: string | null;
  neutered: boolean;
  ownerExternalId: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
};

type PetDto = {
  id: string | number;
  name?: string;
  breed?: { name?: string; nameKo?: string } | null;
  birthDate?: string;
  weight?: number;
  gender?: string;
  neutered?: boolean;
  isNeutered?: boolean;
  owners?: Array<{ id?: string | number; name?: string; realname?: string; phoneNumber?: string }>;
};

function mapPet(dto: PetDto): SyncPet {
  const owner = (dto.owners ?? [])[0];
  return {
    externalId: String(dto.id),
    name: dto.name || "이름 없음",
    breed: dto.breed?.nameKo ?? dto.breed?.name ?? null,
    birthDate: dto.birthDate ? dto.birthDate.slice(0, 10) : null,
    weight: typeof dto.weight === "number" ? dto.weight : null,
    gender: dto.gender ? String(dto.gender).toLowerCase() : null,
    neutered: Boolean(dto.neutered ?? dto.isNeutered ?? false),
    ownerExternalId: owner?.id !== undefined && owner?.id !== null ? String(owner.id) : null,
    ownerName: owner?.name || owner?.realname || null,
    ownerPhone: owner?.phoneNumber ?? null,
  };
}

/** 외부 API에서 반려견 전체 목록을 페이지 단위로 모두 가져온다. */
export async function fetchAllExternalPets(maxPages = 40, limit = 100): Promise<SyncPet[]> {
  const all: SyncPet[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const res = await apiGet<{
      total?: number;
      pets?: PetDto[];
      data?: { pets?: PetDto[]; total?: number; totalCount?: number; meta?: { total?: number } };
    }>("/pets", { page, limit });

    const rows = res.data?.pets ?? res.pets ?? [];
    if (!rows.length) break;

    for (const row of rows) {
      const mapped = mapPet(row);
      if (seen.has(mapped.externalId)) continue;
      seen.add(mapped.externalId);
      all.push(mapped);
    }

    const total = res.data?.total ?? res.data?.totalCount ?? res.data?.meta?.total ?? res.total ?? 0;
    if (rows.length < limit) break;
    if (total && all.length >= total) break;
  }

  return all;
}
