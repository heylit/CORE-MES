import type { Db } from '#cekirdek/db.ts';
import type { OnculTuru } from '../../kurallar.ts';

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
