import type { Db } from '#cekirdek/db.ts';
import type { OnculTuru } from '../../kurallar.ts';
import { ISO } from '../ortak/sorgular.ts';

export interface SiraDisiBaslatmaYazisi {
  uretimEmriId: number; isEmriId: number; onculIsEmriId: number; onculTuru: OnculTuru; devirAdedi: number | null;
  hazirAdet: number; onculSayilan: number; kisiId: number; istasyonId: number; an: string;
}
export function siraDisiBaslatmaEkle(db: Db, y: SiraDisiBaslatmaYazisi): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_emirleri_sira_disi_baslatma
       (uretim_emri_id, is_emri_id, oncul_is_emri_id, oncul_turu, devir_adedi, hazir_adet, oncul_sayilan, kisi_id, istasyon_id, zaman)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)`,
    [y.uretimEmriId, y.isEmriId, y.onculIsEmriId, y.onculTuru, y.devirAdedi, y.hazirAdet, y.onculSayilan, y.kisiId, y.istasyonId, y.an],
  );
}

export interface SiraDisiSatiri { uretimEmriId: number; isEmriId: number; onculIsEmriId: number; onculTuru: OnculTuru; devirAdedi: number | null; zaman: string }
// Adım ve öncül başına ilk kayıt: olay ilk sıra dışı başlatmadan beri açıktır.
export function siraDisiBaslatmalarGetir(db: Db, isEmriIdleri: readonly number[]): Promise<SiraDisiSatiri[]> {
  if (isEmriIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<SiraDisiSatiri>(
    `SELECT DISTINCT ON (is_emri_id, oncul_is_emri_id) uretim_emri_id AS "uretimEmriId", is_emri_id AS "isEmriId", oncul_is_emri_id AS "onculIsEmriId",
            oncul_turu AS "onculTuru", devir_adedi AS "devirAdedi", ${ISO('zaman')} AS zaman
       FROM uretim_emirleri_sira_disi_baslatma WHERE is_emri_id = ANY($1::int[])
      ORDER BY is_emri_id, oncul_is_emri_id, zaman, id`,
    [[...isEmriIdleri]],
  );
}
