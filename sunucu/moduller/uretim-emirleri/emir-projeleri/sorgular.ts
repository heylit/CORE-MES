import type { Db } from '#cekirdek/db.ts';

// Emrin projesi (664): Üretim Terminali başlığı projeyi emirden okur. Tek sorgu; boş dizide sorgu yok; olmayan ya da
// projesiz emir haritada yoktur.
export async function emirlerinProjeleri(db: Db, emirIdler: readonly number[]): Promise<Map<number, number>> {
  const tekil = [...new Set(emirIdler)];
  if (tekil.length === 0) return new Map();
  const satirlar = await db.sorgu<{ id: number; projeId: number }>(
    'SELECT e.id, e.proje_id AS "projeId" FROM uretim_emri e WHERE e.id = ANY($1::int[]) AND e.proje_id IS NOT NULL', [tekil],
  );
  return new Map(satirlar.map((s) => [s.id, s.projeId]));
}
