import type { Db } from '#cekirdek/db.ts';
import { ISO } from '../ortak/sorgular.ts';

// Adım Durumu (2893): elle statü ve elle hazırlık onayı defterleri. Satır silinmez; açık kayıt iş emri (ve madde) başına son satırdır.
export interface ElleStatuSatiri {
  id: number; isEmriId: number; olay: 'yaz' | 'kaldir'; statu: string | null; sistemStatusu: string | null; aciklama: string | null;
  kisiId: number; zaman: string;
}
export interface HazirlikOnaySatiri {
  id: number; isEmriId: number; madde: string; olay: 'onay' | 'kaldir'; sistemHali: string | null; gerekce: string | null;
  onaylananSurum: string | null; kisiId: number; zaman: string;
}

export function elleStatuDefteri(db: Db, isEmriIdleri: readonly number[]): Promise<ElleStatuSatiri[]> {
  return db.sorgu<ElleStatuSatiri>(
    `SELECT id, is_emri_id AS "isEmriId", olay, statu, sistem_statusu AS "sistemStatusu", aciklama, kisi_id AS "kisiId", ${ISO('zaman')} AS zaman
       FROM uretim_emirleri_adim_statusu WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, id`,
    [[...isEmriIdleri]],
  );
}

export function elleStatuEkle(
  db: Db, s: { isEmriId: number; olay: 'yaz' | 'kaldir'; statu: string | null; sistemStatusu: string | null; aciklama: string | null; kisiId: number },
): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_emirleri_adim_statusu (is_emri_id, olay, statu, sistem_statusu, aciklama, kisi_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [s.isEmriId, s.olay, s.statu, s.sistemStatusu, s.aciklama, s.kisiId],
  );
}

export function hazirlikOnayDefteri(db: Db, isEmriIdleri: readonly number[]): Promise<HazirlikOnaySatiri[]> {
  return db.sorgu<HazirlikOnaySatiri>(
    `SELECT id, is_emri_id AS "isEmriId", madde, olay, sistem_hali AS "sistemHali", gerekce, onaylanan_surum AS "onaylananSurum",
            kisi_id AS "kisiId", ${ISO('zaman')} AS zaman
       FROM uretim_emirleri_hazirlik_onayi WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, id`,
    [[...isEmriIdleri]],
  );
}

export function hazirlikOnayiEkle(
  db: Db, o: { isEmriId: number; madde: string; olay: 'onay' | 'kaldir'; sistemHali: string | null; gerekce: string | null; onaylananSurum: string | null; kisiId: number },
): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_emirleri_hazirlik_onayi (is_emri_id, madde, olay, sistem_hali, gerekce, onaylanan_surum, kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [o.isEmriId, o.madde, o.olay, o.sistemHali, o.gerekce, o.onaylananSurum, o.kisiId],
  );
}

// Aynı iş emrine eşzamanlı iki yazma sırayla girer: iş emri satırı kilitlenir (okunan son kayda göre karar verilir).
export async function isEmriKilitle(db: Db, isEmriId: number, uretimEmriId: number): Promise<boolean> {
  return (await db.tek(`SELECT 1 AS var FROM uretim_emirleri_is_emri WHERE id = $1 AND uretim_emri_id = $2 FOR UPDATE`, [isEmriId, uretimEmriId])) !== null;
}
