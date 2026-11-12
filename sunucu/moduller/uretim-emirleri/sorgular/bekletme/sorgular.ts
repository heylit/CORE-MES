import type { Db } from '#cekirdek/db.ts';
import type { BeklemeNedeni } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ISO } from '../ortak/sorgular.ts';

export interface BekletmeYazisi { uretimEmriId: number; olay: 'beklet' | 'devam'; neden: BeklemeNedeni | null; not: string | null; kisiId: number; an: string }
export function bekletmeOlayiEkle(db: Db, y: BekletmeYazisi): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_emirleri_bekletme (uretim_emri_id, olay, neden, not_metni, kisi_id, zaman) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [y.uretimEmriId, y.olay, y.neden, y.not, y.kisiId, y.an],
  );
}

export interface BekletmeSatiri { uretimEmriId: number; neden: BeklemeNedeni; not: string | null; kisiId: number; zaman: string }
// Emir başına son olay 'beklet' ise emir beklemededir; 'devam' ya da olay yoksa değildir.
export async function aktifBekletmeler(db: Db, emirIdleri: readonly number[]): Promise<BekletmeSatiri[]> {
  if (emirIdleri.length === 0) return [];
  const satirlar = await db.sorgu<BekletmeSatiri & { olay: string }>(
    `SELECT DISTINCT ON (uretim_emri_id) uretim_emri_id AS "uretimEmriId", olay, neden, not_metni AS "not", kisi_id AS "kisiId", ${ISO('zaman')} AS zaman
       FROM uretim_emirleri_bekletme WHERE uretim_emri_id = ANY($1::int[])
      ORDER BY uretim_emri_id, id DESC`,
    [[...emirIdleri]],
  );
  return satirlar.filter((s) => s.olay === 'beklet').map(({ olay: _o, ...s }) => s);
}

export interface BekletmeOlaySatiri { id: number; olay: 'beklet' | 'devam'; neden: BeklemeNedeni | null; not: string | null; kisiId: number; zaman: string }
export function bekletmeOlaylari(db: Db, emirId: number): Promise<BekletmeOlaySatiri[]> {
  return db.sorgu<BekletmeOlaySatiri>(
    `SELECT id, olay, neden, not_metni AS "not", kisi_id AS "kisiId", ${ISO('zaman')} AS zaman
       FROM uretim_emirleri_bekletme WHERE uretim_emri_id = $1 ORDER BY id`,
    [emirId],
  );
}
