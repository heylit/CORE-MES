import type { Db } from '#cekirdek/db.ts';
import type { EmirDurumu, EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// 3272: siparişten kendiliğinden açılan emirler. Emir siparişe kalemiyle (siparis_satiri_id) ya da siparişten açılmış projesiyle bağlıdır.
export interface SiparisEmriSatiri {
  id: number;
  emirNo: string;
  durum: EmirDurumu;
  arsiv: boolean;
  malzemeNo: number;
  emirTuru: EmirTuru;
  siparisSatiriId: number | null;
  siparisPartiId: number | null;
  projeId: number | null;
  acilisKaynagi: 'siparis_onayi' | null;
  rotaBekliyor: boolean;
  surum: number;
}
const SECIM = `e.id, e.emir_no AS "emirNo", e.durum, e.arsiv, e.malzeme_no AS "malzemeNo", e.emir_turu AS "emirTuru",
  e.siparis_satiri_id AS "siparisSatiriId", e.siparis_parti_id AS "siparisPartiId", e.proje_id AS "projeId",
  e.acilis_kaynagi AS "acilisKaynagi", e.rota_bekliyor AS "rotaBekliyor", e.surum`;

// Kaleme bağlı bütün emirler (bölünmüş partinin alt emri dahil değil: alt emir üst emrin kalemini taşımaz) ve projede kalemden çözülmüş
// kendiliğinden açılmış emirler. İptal edilmiş emir de döner; çağıran süzer.
export function siparisEmirleri(db: Db, kalemIdleri: readonly number[], projeIdleri: readonly number[]): Promise<SiparisEmriSatiri[]> {
  return db.sorgu<SiparisEmriSatiri>(
    `SELECT ${SECIM} FROM uretim_emri e
      WHERE e.ust_emir_id IS NULL
        AND (e.siparis_satiri_id = ANY($1::int[])
             OR (e.siparis_satiri_id IS NULL AND e.acilis_kaynagi = 'siparis_onayi' AND e.proje_id = ANY($2::int[])))
      ORDER BY e.id`,
    [[...kalemIdleri], [...projeIdleri]],
  );
}

export function siparisEmirleriKilitle(db: Db, idler: readonly number[]): Promise<SiparisEmriSatiri[]> {
  return db.sorgu<SiparisEmriSatiri>(`SELECT ${SECIM} FROM uretim_emri e WHERE e.id = ANY($1::int[]) ORDER BY e.id FOR UPDATE`, [[...idler]]);
}

export function acilisKaynagiYaz(db: Db, id: number): Promise<unknown> {
  return db.sorgu("UPDATE uretim_emri SET acilis_kaynagi = 'siparis_onayi', surum = surum + 1 WHERE id = $1", [id]);
}

// 3272-3 a: onayı geri alınan siparişin dokunulmamış emri kalemden çözülür; kalem değişebilir. Teslim bağı kalemle gider.
export function kalemdenCoz(db: Db, idler: readonly number[]): Promise<unknown> {
  return db.sorgu(
    'UPDATE uretim_emri SET siparis_satiri_id = NULL, siparis_parti_id = NULL, teslim_bagli = false, surum = surum + 1 WHERE id = ANY($1::int[])',
    [[...idler]],
  );
}

// Yeniden onayda çözülmüş emir eş partiye bağlanır; adedi ve teslimi kaleme uyar, teslim kalemin terminine bağlıdır (3244 b).
export function kalemeBagla(db: Db, id: number, g: { satirId: number; partiId: number | null; adet: number; teslim: string | null }): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emri SET siparis_satiri_id = $2, siparis_parti_id = $3, adet = $4, teslim = $5::date, teslim_bagli = $5::date IS NOT NULL,
            surum = surum + 1 WHERE id = $1`,
    [id, g.satirId, g.partiId, g.adet, g.teslim],
  );
}

// UE-SA-04: rota bekleyen emirler (taslak, arşivsiz); rota yürürlüğe girince rota modülü bunlara uygular.
export interface RotaBekleyenEmir { id: number; emirNo: string; malzemeNo: number; emirTuru: EmirTuru; surum: number }
export function rotaBekleyenEmirler(db: Db, malzemeNolari: readonly number[]): Promise<RotaBekleyenEmir[]> {
  return db.sorgu<RotaBekleyenEmir>(
    `SELECT e.id, e.emir_no AS "emirNo", e.malzeme_no AS "malzemeNo", e.emir_turu AS "emirTuru", e.surum
       FROM uretim_emri e
      WHERE e.rota_bekliyor AND e.durum = 'taslak' AND NOT e.arsiv AND e.malzeme_no = ANY($1::int[])
      ORDER BY e.id`,
    [[...malzemeNolari]],
  );
}
