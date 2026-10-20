import type { Db } from '#cekirdek/db.ts';
import type { EmirDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';

export interface EmirAramaSatiri {
  id: number;
  emirNo: string;
  parcaNo: string | null;
  parcaAd: string | null;
  durum: EmirDurumu;
}

// Metin emir no'da, parça no'da ya da parça adında geçer (büyük-küçük harf duyarsız). Emir no'su tam tutan önce, sonra yeniden eskiye.
export function emirAra(db: Db, metin: string, sinir: number): Promise<EmirAramaSatiri[]> {
  const desen = `%${metin.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db.sorgu<EmirAramaSatiri>(
    `SELECT id, emir_no AS "emirNo", parca_no AS "parcaNo", parca_ad AS "parcaAd", durum FROM uretim_emri
      WHERE emir_no ILIKE $1 OR parca_no ILIKE $1 OR parca_ad ILIKE $1
      ORDER BY (upper(emir_no) = upper($2)) DESC, id DESC LIMIT $3`,
    [desen, metin, sinir],
  );
}

// Operatörün araması: aynı eşleşme, yalnız istasyonda adımı olan (adımsız emirde emrin istasyonu) planlı ya da başlamış emir.
export function istasyondaEmirAra(db: Db, metin: string, istasyonId: number, sinir: number): Promise<EmirAramaSatiri[]> {
  const desen = `%${metin.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db.sorgu<EmirAramaSatiri>(
    `SELECT e.id, e.emir_no AS "emirNo", e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", e.durum FROM uretim_emri e
      WHERE e.durum IN ('planli', 'basladi')
        AND (e.istasyon_id = $3 OR EXISTS (SELECT 1 FROM uretim_emirleri_is_emri a WHERE a.uretim_emri_id = e.id AND a.istasyon_id = $3))
        AND (e.emir_no ILIKE $1 OR e.parca_no ILIKE $1 OR e.parca_ad ILIKE $1)
      ORDER BY (upper(e.emir_no) = upper($2)) DESC, e.id DESC LIMIT $4`,
    [desen, metin, istasyonId, sinir],
  );
}
