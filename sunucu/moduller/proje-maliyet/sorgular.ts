import type { Db } from '#cekirdek/db.ts';
import type { DefterSatiri, MaliyetKaydi } from './kurallar.ts';

export async function defterOku(db: Db, projeId: number): Promise<Map<number, DefterSatiri>> {
  const satirlar = await db.sorgu<DefterSatiri>(
    `SELECT is_emri_id AS "isEmriId", plan, gercek FROM proje_maliyet_defteri WHERE proje_id = $1`,
    [projeId],
  );
  return new Map(satirlar.map((s) => [s.isEmriId, s]));
}

export async function defterdekiIsEmirleri(db: Db): Promise<Set<number>> {
  const satirlar = await db.sorgu<{ isEmriId: number }>('SELECT is_emri_id AS "isEmriId" FROM proje_maliyet_defteri');
  return new Set(satirlar.map((s) => s.isEmriId));
}

// Yalnız ekleme; aynı iş emri ikinci kez yazılmaz (eşzamanlı iki yazımda ikincisi sessizce geçer). Dönen sayı yazılan satırdır.
// Sunucu işi yazınca kişi yoktur (236 a): donduran boş kalır.
export async function defterYaz(db: Db, projeId: number, kisiId: number | null, kayitlar: readonly MaliyetKaydi[]): Promise<number> {
  let yazilan = 0;
  for (const k of kayitlar) {
    if (k.isEmri === null || k.isEmri.bitisZamani === null) continue;
    const satir = await db.tek<{ id: string }>(
      `INSERT INTO proje_maliyet_defteri (proje_id, is_emri_id, plan, gercek, ucretler, adet, saglam, bitis, donduran_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT ON CONSTRAINT proje_maliyet_defteri_is_emri_tekil DO NOTHING
       RETURNING id::text`,
      [projeId, k.isEmri.isEmriId, JSON.stringify(k.plan), JSON.stringify(k.gercek), JSON.stringify(k.ucretler), k.adet, k.saglam, k.isEmri.bitisZamani, kisiId],
    );
    if (satir !== null) yazilan += 1;
  }
  return yazilan;
}
