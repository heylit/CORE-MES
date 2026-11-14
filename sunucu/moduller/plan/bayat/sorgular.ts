import type { Db } from '#cekirdek/db.ts';
import type { BayatNedeni } from './kurallar.ts';

// 2319 (S7): canlı planı eskiten olaylar ve canlı planın bitmemiş satırları. Canlı satır ana yerleşim ya da bölünmüş işin parçasıdır.

// 2320: dinleyici yalnız kendi tablosuna ekler; aynı olay iki kez yazılmaz (tekil dizin). Silme yoktur (büyüme notu YAMA-NOTU'nda).
export async function olayYaz(db: Db, neden: Exclude<BayatNedeni, 'durus'>, uretimEmriId: number, kaynakId: number | null): Promise<void> {
  await db.sorgu(
    `INSERT INTO plan_bayat_olayi (neden, uretim_emri_id, kaynak_id) VALUES ($1, $2, $3)
       ON CONFLICT (neden, uretim_emri_id, COALESCE(kaynak_id, 0)) DO NOTHING`,
    [neden, uretimEmriId, kaynakId],
  );
}

export interface OlaySatiri { neden: Exclude<BayatNedeni, 'durus'>; uretimEmriId: number; zaman: string }
export const olaylar = (db: Db, sonra: string): Promise<OlaySatiri[]> =>
  db.sorgu<OlaySatiri>(
    `SELECT neden, uretim_emri_id AS "uretimEmriId", to_json(zaman) #>> '{}' AS zaman FROM plan_bayat_olayi
      WHERE zaman > $1::timestamptz ORDER BY zaman DESC, id DESC`,
    [sonra],
  );

// İş emirlerinden birinin canlıda an'dan sonra biten satırı var mı (plan o işe hâlâ yer ayırıyor).
export async function bitmemisSatirVar(db: Db, isEmriIdleri: readonly number[], an: string): Promise<boolean> {
  if (isEmriIdleri.length === 0) return false;
  const r = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM plan_yerlesimi WHERE is_emri_id = ANY($1::int[]) AND bitis > $2::timestamptz)
         OR EXISTS (SELECT 1 FROM plan_yerlesim_parcasi WHERE is_emri_id = ANY($1::int[]) AND bitis > $2::timestamptz) AS var`,
    [isEmriIdleri, an],
  );
  return r?.var ?? false;
}

// İş emirlerinden biri canlıda mı.
export async function canlidaVar(db: Db, isEmriIdleri: readonly number[]): Promise<boolean> {
  if (isEmriIdleri.length === 0) return false;
  const r = await db.tek<{ var: boolean }>(`SELECT EXISTS (SELECT 1 FROM plan_yerlesimi WHERE is_emri_id = ANY($1::int[])) AS var`, [isEmriIdleri]);
  return r?.var ?? false;
}

// Canlıda an'dan sonra biten işi olan makineler.
export async function bitmemisMakineler(db: Db, an: string): Promise<number[]> {
  const satirlar = await db.sorgu<{ makineId: number }>(
    `SELECT makine_id AS "makineId" FROM plan_yerlesimi WHERE makine_id IS NOT NULL AND bitis > $1::timestamptz
      UNION SELECT makine_id FROM plan_yerlesim_parcasi WHERE makine_id IS NOT NULL AND bitis > $1::timestamptz`,
    [an],
  );
  return satirlar.map((s) => s.makineId);
}

// 3256-1: canlıda an'dan sonra biten iş emirleri (ana yerleşim ya da bölünmüş işin parçası).
export async function bitmemisIsEmirleri(db: Db, an: string): Promise<number[]> {
  const satirlar = await db.sorgu<{ isEmriId: number }>(
    `SELECT is_emri_id AS "isEmriId" FROM plan_yerlesimi WHERE is_emri_id > 0 AND bitis > $1::timestamptz
      UNION SELECT is_emri_id FROM plan_yerlesim_parcasi WHERE is_emri_id > 0 AND bitis > $1::timestamptz`,
    [an],
  );
  return satirlar.map((s) => s.isEmriId);
}
