import type { Db } from '#cekirdek/db.ts';
import { MALIYET_TABLOLARI } from '../kurallar.ts';
import type { MaliyetTuru } from '../kurallar.ts';

export interface KaldirilacakMaliyet { anahtar: number; birimMaliyet: string; paraBirimi: string; guncelleyenId: number; surum: number }

// Kilitli okunur: sürüm denetimi ile silme arasına eşzamanlı düzeltme giremez.
export function maliyetKilitle(db: Db, t: MaliyetTuru, anahtar: number): Promise<KaldirilacakMaliyet | null> {
  const m = MALIYET_TABLOLARI[t];
  return db.tek<KaldirilacakMaliyet>(
    `SELECT ${m.anahtar} AS anahtar, ${m.tutar} AS "birimMaliyet", rtrim(para_birimi) AS "paraBirimi", guncelleyen_id AS "guncelleyenId", surum
       FROM ${m.tablo} WHERE ${m.anahtar} = $1 FOR UPDATE`, [anahtar]);
}

export function maliyetSil(db: Db, t: MaliyetTuru, anahtar: number, surum: number): Promise<{ anahtar: number } | null> {
  const m = MALIYET_TABLOLARI[t];
  return db.tek<{ anahtar: number }>(`DELETE FROM ${m.tablo} WHERE ${m.anahtar} = $1 AND surum = $2 RETURNING ${m.anahtar} AS anahtar`, [anahtar, surum]);
}
