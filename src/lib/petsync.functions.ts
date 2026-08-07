import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LocalPet = {
  /** 외부 시스템 ID (없으면 내부 ID) */
  id: string;
  /** 내부 DB의 반려견 ID */
  dbId: string;
  name: string;
  breed: string | null;
  birthDate: string | null;
  weight: number | null;
  gender: string | null;
  neutered: boolean;
  ownerNames: string[];
  ownerId: string | null;
  ownerPhone: string | null;
  syncedAt: string | null;
};

export type SyncResult = {
  ownersUpserted: number;
  dogsUpserted: number;
  total: number;
  error: string | null;
};

/** 외부 API 반려견/보호자 데이터를 내부 DB로 동기화 */
export const syncPetsToDb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncResult> => {
    const supabase = context.supabase;
    try {
      const { fetchAllExternalPets } = await import("./petsync.server");
      const pets = await fetchAllExternalPets();
      if (!pets.length) return { ownersUpserted: 0, dogsUpserted: 0, total: 0, error: null };

      // ---- 보호자 동기화 ----
      const ownerMap = new Map<string, { name: string; phone: string }>();
      for (const pet of pets) {
        const key = pet.ownerExternalId ?? `pet-${pet.externalId}`;
        if (!ownerMap.has(key)) {
          ownerMap.set(key, {
            name: pet.ownerName ?? "보호자 미확인",
            phone: pet.ownerPhone ?? "-",
          });
        }
      }

      const ownerKeys = [...ownerMap.keys()];
      const existingOwners = new Map<string, string>();
      for (let i = 0; i < ownerKeys.length; i += 200) {
        const chunk = ownerKeys.slice(i, i + 200);
        const { data, error } = await supabase
          .from("owners")
          .select("id, external_id")
          .in("external_id", chunk);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          if (row.external_id) existingOwners.set(row.external_id, row.id);
        }
      }

      const newOwnerRows = ownerKeys
        .filter((k) => !existingOwners.has(k))
        .map((k) => ({
          name: ownerMap.get(k)!.name,
          phone: ownerMap.get(k)!.phone,
          external_id: k,
          external_source: "owner",
        }));

      let ownersUpserted = 0;
      for (let i = 0; i < newOwnerRows.length; i += 200) {
        const chunk = newOwnerRows.slice(i, i + 200);
        const { data, error } = await supabase.from("owners").insert(chunk).select("id, external_id");
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          if (row.external_id) existingOwners.set(row.external_id, row.id);
        }
        ownersUpserted += data?.length ?? 0;
      }

      // ---- 반려견 동기화 ----
      const petIds = pets.map((p) => p.externalId);
      const existingDogs = new Map<string, string>();
      for (let i = 0; i < petIds.length; i += 200) {
        const chunk = petIds.slice(i, i + 200);
        const { data, error } = await supabase.from("dogs").select("id, external_id").in("external_id", chunk);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          if (row.external_id) existingDogs.set(row.external_id, row.id);
        }
      }

      const now = new Date().toISOString();
      const toRow = (pet: (typeof pets)[number]) => {
        const ownerKey = pet.ownerExternalId ?? `pet-${pet.externalId}`;
        return {
          owner_id: existingOwners.get(ownerKey)!,
          name: pet.name,
          breed: pet.breed,
          gender: pet.gender ?? "unknown",
          neutered: pet.neutered,
          birth_date: pet.birthDate,
          weight_kg: pet.weight,
          external_id: pet.externalId,
          synced_at: now,
        };
      };

      const inserts = pets.filter((p) => !existingDogs.has(p.externalId)).map(toRow);
      let dogsUpserted = 0;
      for (let i = 0; i < inserts.length; i += 200) {
        const chunk = inserts.slice(i, i + 200).filter((r) => r.owner_id);
        if (!chunk.length) continue;
        const { error } = await supabase.from("dogs").insert(chunk);
        if (error) throw new Error(error.message);
        dogsUpserted += chunk.length;
      }

      const updates = pets.filter((p) => existingDogs.has(p.externalId));
      for (const pet of updates) {
        const row = toRow(pet);
        if (!row.owner_id) continue;
        const { error } = await supabase
          .from("dogs")
          .update(row)
          .eq("id", existingDogs.get(pet.externalId)!);
        if (error) throw new Error(error.message);
        dogsUpserted += 1;
      }

      await supabase.from("sync_log").insert({
        kind: "pets",
        owners_upserted: ownersUpserted,
        dogs_upserted: dogsUpserted,
      });

      return { ownersUpserted, dogsUpserted, total: pets.length, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : "동기화에 실패했습니다.";
      console.error("Pet sync failed:", e);
      await supabase
        .from("sync_log")
        .insert({ kind: "pets", error_message: message.slice(0, 500) });
      return { ownersUpserted: 0, dogsUpserted: 0, total: 0, error: message };
    }
  });

/** 내부 DB 반려견 목록 조회 (검색/페이지) */
export const listLocalPets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; page?: number; limit?: number }) => ({
    search: typeof input?.search === "string" ? input.search.trim().slice(0, 100) : "",
    page: Math.min(Math.max(Number(input?.page) || 1, 1), 1000),
    limit: Math.min(Math.max(Number(input?.limit) || 50, 1), 100),
  }))
  .handler(async ({ data, context }): Promise<{ pets: LocalPet[]; total: number; lastSyncedAt: string | null }> => {
    const supabase = context.supabase;
    const from = (data.page - 1) * data.limit;

    let query = supabase
      .from("dogs")
      .select("id, name, breed, gender, neutered, birth_date, weight_kg, external_id, synced_at, owners(name, phone, external_id)", {
        count: "exact",
      })
      .eq("active", true);

    if (data.search) {
      const like = `%${data.search.replace(/[%_,]/g, "")}%`;
      const { data: matchedOwners } = await supabase
        .from("owners")
        .select("id")
        .or(`name.ilike.${like},phone.ilike.${like}`)
        .limit(500);
      const ownerIds = (matchedOwners ?? []).map((o) => o.id);
      const clauses = [`name.ilike.${like}`, `breed.ilike.${like}`];
      if (ownerIds.length) clauses.push(`owner_id.in.(${ownerIds.join(",")})`);
      query = query.or(clauses.join(","));
    }

    const { data: rows, error, count } = await query
      .order("name", { ascending: true })
      .range(from, from + data.limit - 1);
    if (error) throw new Error(error.message);

    const { data: lastSync } = await supabase
      .from("dogs")
      .select("synced_at")
      .not("synced_at", "is", null)
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const pets: LocalPet[] = (rows ?? []).map((r) => {
      const owner = r.owners as { name?: string; phone?: string; external_id?: string } | null;
      return {
        id: r.external_id ?? r.id,
        dbId: r.id,
        name: r.name,
        breed: r.breed,
        birthDate: r.birth_date,
        weight: r.weight_kg === null ? null : Number(r.weight_kg),
        gender: r.gender,
        neutered: r.neutered,
        ownerNames: owner?.name ? [owner.name] : [],
        ownerId: owner?.external_id ?? null,
        ownerPhone: owner?.phone && owner.phone !== "-" ? owner.phone : null,
        syncedAt: r.synced_at,
      };
    });

    return { pets, total: count ?? pets.length, lastSyncedAt: lastSync?.synced_at ?? null };
  });
