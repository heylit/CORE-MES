import type { Db } from '#cekirdek/db.ts';

// 3396 a: hazırlık maddesi listesi (göç 20261117141500). Satır silinmez; sistem maddesi göçle, özel madde ayar ekranından eklenir.
export interface HazirlikMaddeSatiri {
  kod: string; ad: string; kisa: string; sira: number; acik: boolean; sistem: boolean; durduran: boolean; surum: number;
}
const ALANLAR = 'kod, ad, kisa, sira, acik, sistem, durduran, surum';

export function hazirlikMaddeSatirlari(db: Db): Promise<HazirlikMaddeSatiri[]> {
  return db.sorgu<HazirlikMaddeSatiri>(`SELECT ${ALANLAR} FROM uretim_emirleri_hazirlik_maddesi ORDER BY sira, kod`);
}

// Koşullu yazma: sürüm tutmazsa null döner (başkası değiştirdi). Durduran maddenin kapatılmasını kısıt da reddeder.
export function hazirlikMaddesiYaz(
  db: Db, kod: string, d: { ad: string; kisa: string; sira: number; acik: boolean; surum: number }, kisiId: number,
): Promise<HazirlikMaddeSatiri | null> {
  return db.tek<HazirlikMaddeSatiri>(
    `UPDATE uretim_emirleri_hazirlik_maddesi
        SET ad = $2, kisa = $3, sira = $4, acik = $5, surum = surum + 1, degistiren_id = $7, degisti = now()
      WHERE kod = $1 AND surum = $6
  RETURNING ${ALANLAR}`,
    [kod, d.ad, d.kisa, d.sira, d.acik, d.surum, kisiId],
  );
}

export async function ozelMaddeNo(db: Db): Promise<number> {
  const no = await db.tek<{ no: string }>(`SELECT nextval('uretim_emirleri_hazirlik_ozel_no')::text AS no`);
  return Number(no?.no);
}

export async function ozelMaddeEkle(db: Db, kod: string, d: { ad: string; kisa: string; sira: number; acik: boolean }, kisiId: number): Promise<HazirlikMaddeSatiri> {
  const satir = await db.tek<HazirlikMaddeSatiri>(
    `INSERT INTO uretim_emirleri_hazirlik_maddesi (kod, ad, kisa, sira, acik, olusturan_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ALANLAR}`,
    [kod, d.ad, d.kisa, d.sira, d.acik, kisiId],
  );
  if (satir === null) throw new Error('Özel hazırlık maddesi eklenemedi.');
  return satir;
}
