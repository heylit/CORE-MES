import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import { ISO } from '../ortak/sorgular.ts';

// 3688: hazırlık şablonu operasyon türüne göre (göç 20261125124500). Sürümler ve satırlar yalnız eklenir; etkin şablon türün en yüksek sürümüdür.
// operasyon_tipi_id NULL varsayılan şablondur (tipi olmayan adım).
export interface SablonSurumSatiri { id: string; operasyon_tipi_id: number | null; surum: number; kisi_id: number; an: string; gerekce: string | null }
export interface SablonSatirSatiri { surum_id: string; madde: string; gerekli: boolean; rol_id: number | null; gun: number }

// Her tür için en yüksek sürüm (varsayılan dahil).
export function etkinSurumler(db: Db): Promise<SablonSurumSatiri[]> {
  return db.sorgu<SablonSurumSatiri>(
    `SELECT DISTINCT ON (COALESCE(operasyon_tipi_id, 0)) id::text AS id, operasyon_tipi_id, surum, kisi_id, an::text AS an, gerekce
       FROM uretim_emirleri_hazirlik_sablonu_surum
   ORDER BY COALESCE(operasyon_tipi_id, 0), surum DESC`,
  );
}

export function surumSatirlari(db: Db, surumIdleri: readonly string[]): Promise<SablonSatirSatiri[]> {
  if (surumIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<SablonSatirSatiri>(
    `SELECT surum_id::text AS surum_id, madde, gerekli, rol_id, gun
       FROM uretim_emirleri_hazirlik_sablonu_satir
      WHERE surum_id = ANY($1::bigint[])
   ORDER BY madde`,
    [surumIdleri],
  );
}

// Tür başına yazma kilidi: aynı türe aynı anda iki kayıt sürüm numarasını yarıştırmasın.
export async function turuKilitle(db: Db, tipId: number | null): Promise<void> {
  await islemKilidiAl(db, 'hazirlik-sablonu', tipId ?? 0);
}

export async function sonSurum(db: Db, tipId: number | null): Promise<number | null> {
  const s = await db.tek<{ surum: number }>(
    `SELECT max(surum)::int AS surum FROM uretim_emirleri_hazirlik_sablonu_surum WHERE COALESCE(operasyon_tipi_id, 0) = COALESCE($1::int, 0)`,
    [tipId],
  );
  return s?.surum ?? null;
}

export async function surumEkle(db: Db, tipId: number | null, surum: number, kisiId: number, gerekce: string | null): Promise<string> {
  const s = await db.tek<{ id: string }>(
    `INSERT INTO uretim_emirleri_hazirlik_sablonu_surum (operasyon_tipi_id, surum, kisi_id, gerekce) VALUES ($1, $2, $3, $4) RETURNING id::text AS id`,
    [tipId, surum, kisiId, gerekce],
  );
  if (s === null) throw new Error('Hazırlık şablonu sürümü eklenemedi.');
  return s.id;
}

export async function satirEkle(db: Db, surumId: string, x: { madde: string; gerekli: boolean; rolId: number | null; gun: number }): Promise<void> {
  await db.sorgu(
    `INSERT INTO uretim_emirleri_hazirlik_sablonu_satir (surum_id, madde, gerekli, rol_id, gun) VALUES ($1::bigint, $2, $3, $4, $5)`,
    [surumId, x.madde, x.gerekli, x.rolId, x.gun],
  );
}

// is_emri_id NULL emir düzeyidir; dolu ise o operasyona özeldir (3741). Öncelik OP farkı > emir farkı > tür şablonudur; birleştirmeyi servis yapar.
export interface OzelFarkSatiri { emri_id: number; is_emri_id: number | null; madde: string; gerekli: boolean; kisi_id: number; an: string; gerekce: string | null }
// Fark (emir ya da OP), madde başına son kayıt "yaz" ise geçerlidir, "sil" ise yoktur.
export function ozelFarklar(db: Db, emirIdleri: readonly number[]): Promise<OzelFarkSatiri[]> {
  if (emirIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<OzelFarkSatiri>(
    `SELECT emri_id, is_emri_id, madde, gerekli, kisi_id, ${ISO('an')} AS an, gerekce FROM (
       SELECT DISTINCT ON (emri_id, COALESCE(is_emri_id, 0), madde) emri_id, is_emri_id, madde, olay, gerekli, kisi_id, an, gerekce
         FROM uretim_emirleri_hazirlik_sablonu_ozel WHERE emri_id = ANY($1::int[]) ORDER BY emri_id, COALESCE(is_emri_id, 0), madde, id DESC) x
      WHERE olay = 'yaz' ORDER BY emri_id, is_emri_id NULLS FIRST, madde`,
    [[...emirIdleri]],
  );
}

export async function ozelEkle(
  db: Db, emirId: number, isEmriId: number | null, madde: string, olay: 'yaz' | 'sil', kisiId: number, gerekli: boolean | null, gerekce: string | null,
): Promise<void> {
  await db.sorgu(
    `INSERT INTO uretim_emirleri_hazirlik_sablonu_ozel (emri_id, is_emri_id, madde, olay, gerekli, kisi_id, gerekce) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [emirId, isEmriId, madde, olay, gerekli, kisiId, gerekce],
  );
}
