import type { Db } from '#cekirdek/db.ts';
import { ISO, NULLU_ISO, TARIH } from '../ortak/sorgular.ts';

// Dış işlem emri (2428). Emre bağlı belgenin firma, termin günü, adım ve durumu iş emrinden, hareketleri iş emrinden okunur;
// partideki belgenin alanları ve hareketleri belgededir.
export interface DieSatiri {
  id: number;
  no: string;
  isEmriId: number | null;
  uretimEmriId: number | null;
  emirNo: string | null;
  emirDurumu: string | null;
  emirMalzemeNo: number | null;
  isEmriDurumu: string | null;
  opNo: number | null;
  adim: string | null;
  adimFirmaId: number | null;
  adimOperasyonTipiId: number | null;
  // Emre bağlı belgede termin: ilk gidişin tesis günü + adımın termin günü (Dış operasyonlar ile aynı); gidiş yoksa boş.
  adimTermini: string | null;
  emirAdedi: number | null;
  malzemeNo: number | null;
  partiId: number | null;
  konumId: number | null;
  operasyonTipiId: number | null;
  hizmetNo: number | null;
  firmaId: number | null;
  adet: number | null;
  planlananGidis: string | null;
  termin: string | null;
  ilkGidis: string | null;
  aciklama: string | null;
  acilis: 'plan' | 'talep' | 'elle' | 'goc';
  olusturanKisiId: number | null;
  olusturmaZamani: string;
  tamamlanmaZamani: string | null;
  iptalZamani: string | null;
  surum: number;
  gonderilen: number;
  donen: number;
  hurda: number;
}

const SECIM = `SELECT d.id, d.no, d.is_emri_id AS "isEmriId", e.id AS "uretimEmriId", e.emir_no AS "emirNo", e.durum AS "emirDurumu",
    e.malzeme_no AS "emirMalzemeNo", i.durum AS "isEmriDurumu", i.op_no AS "opNo", i.ad AS adim, i.fason_firma_id AS "adimFirmaId",
    i.operasyon_tipi_id AS "adimOperasyonTipiId", CASE WHEN h.ilk_gidis IS NULL OR i.termin_gun IS NULL THEN NULL ELSE to_char(h.ilk_gidis::date + i.termin_gun, 'YYYY-MM-DD') END AS "adimTermini", e.adet AS "emirAdedi",
    d.malzeme_no AS "malzemeNo", d.parti_id AS "partiId", d.konum_id AS "konumId", d.operasyon_tipi_id AS "operasyonTipiId",
    d.hizmet_no AS "hizmetNo", d.fason_firma_id AS "firmaId", d.adet, ${TARIH('d.planlanan_gidis')} AS "planlananGidis",
    ${TARIH('d.termin')} AS termin, ${NULLU_ISO('h.ilk_gidis')} AS "ilkGidis", d.aciklama, d.acilis, d.olusturan_kisi_id AS "olusturanKisiId",
    ${ISO('d.olusturma_zamani')} AS "olusturmaZamani", ${NULLU_ISO('d.tamamlanma_zamani')} AS "tamamlanmaZamani",
    ${NULLU_ISO('d.iptal_zamani')} AS "iptalZamani", d.surum,
    COALESCE(h.gonderilen, 0) AS gonderilen, COALESCE(h.donen, 0) AS donen, COALESCE(h.hurda, 0) AS hurda
  FROM uretim_emirleri_dis_islem_emri d
  LEFT JOIN uretim_emirleri_is_emri i ON i.id = d.is_emri_id
  LEFT JOIN uretim_emri e ON e.id = i.uretim_emri_id
  LEFT JOIN LATERAL (
    SELECT min(f.zaman) FILTER (WHERE f.yon = 'gidis') AS ilk_gidis, (sum(f.adet) FILTER (WHERE f.yon = 'gidis'))::int AS gonderilen,
      (sum(f.adet) FILTER (WHERE f.yon = 'donus'))::int AS donen, (sum(f.hurda_adet) FILTER (WHERE f.yon = 'donus'))::int AS hurda
    FROM uretim_emirleri_fason_hareketi f
    WHERE (d.is_emri_id IS NOT NULL AND f.is_emri_id = d.is_emri_id) OR (d.is_emri_id IS NULL AND f.die_id = d.id)
  ) h ON true`;

export function dieGetir(db: Db, id: number): Promise<DieSatiri | null> {
  return db.tek<DieSatiri>(`${SECIM} WHERE d.id = $1`, [id]);
}

export function dieIsEmrindenGetir(db: Db, isEmriId: number): Promise<DieSatiri | null> {
  return db.tek<DieSatiri>(`${SECIM} WHERE d.is_emri_id = $1`, [isEmriId]);
}

// Komutlar belge satırını kilitler: aynı belgeye eşzamanlı iki hareket toplamı aynı anda okuyup aşamaz.
export async function dieKilitle(db: Db, id: number): Promise<boolean> {
  return (await db.tek<{ id: number }>('SELECT id FROM uretim_emirleri_dis_islem_emri WHERE id = $1 FOR UPDATE', [id])) !== null;
}

// Açık belgeler: kapanmamış parti belgeleri ve adımı açık emirde fason duran emre bağlı belgeler (Dış operasyonlar ölçütü).
// hepsi: kapananlar da (en yeni önce, sınırlı).
export function dieListesiGetir(db: Db, g: { hepsi: boolean; sinir: number }): Promise<DieSatiri[]> {
  return db.sorgu<DieSatiri>(
    `${SECIM}
     WHERE $1::boolean
        OR (d.is_emri_id IS NULL AND d.tamamlanma_zamani IS NULL AND d.iptal_zamani IS NULL)
        OR (d.is_emri_id IS NOT NULL AND i.fason_firma_id IS NOT NULL AND i.durum <> 'tamam' AND e.durum NOT IN ('iptal', 'bitti') AND NOT e.arsiv)
     ORDER BY d.id DESC
     LIMIT $2`,
    [g.hepsi, g.sinir],
  );
}

export interface DieHareketSatiri {
  id: number; dieId: number; yon: 'gidis' | 'donus'; adet: number; hurda: number | null; kisiId: number; zaman: string;
}

export function dieHareketleriGetir(db: Db, idler: readonly number[]): Promise<DieHareketSatiri[]> {
  if (idler.length === 0) return Promise.resolve([]);
  return db.sorgu<DieHareketSatiri>(
    `SELECT f.id, d.id AS "dieId", f.yon, f.adet, f.hurda_adet AS hurda, f.kisi_id AS "kisiId", ${ISO('f.zaman')} AS zaman
       FROM uretim_emirleri_dis_islem_emri d
       JOIN uretim_emirleri_fason_hareketi f ON (d.is_emri_id IS NOT NULL AND f.is_emri_id = d.is_emri_id) OR (d.is_emri_id IS NULL AND f.die_id = d.id)
      WHERE d.id = ANY($1::int[])
      ORDER BY f.zaman, f.id`,
    [idler],
  );
}

export interface DieYazisi {
  isEmriId: number | null;
  malzemeNo: number | null; partiId: number | null; konumId: number | null; operasyonTipiId: number | null; hizmetNo: number | null;
  firmaId: number | null; adet: number | null; planlananGidis: string | null; termin: string | null; aciklama: string | null;
  acilis: 'talep' | 'elle'; kisiId: number;
}

export async function dieEkle(db: Db, y: DieYazisi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emirleri_dis_islem_emri (is_emri_id, malzeme_no, parti_id, konum_id, operasyon_tipi_id, hizmet_no, fason_firma_id, adet,
       planlanan_gidis, termin, aciklama, acilis, olusturan_kisi_id, olusturma_zamani)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, now()) RETURNING id`,
    [y.isEmriId, y.malzemeNo, y.partiId, y.konumId, y.operasyonTipiId, y.hizmetNo, y.firmaId, y.adet, y.planlananGidis, y.termin, y.aciklama, y.acilis, y.kisiId],
  );
  if (satir === null) throw new Error('Dış işlem emri eklenemedi.');
  return satir.id;
}

export function dieHareketiEkle(db: Db, h: { dieId: number; yon: 'gidis' | 'donus'; adet: number; hurda: number | null; kisiId: number }): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `INSERT INTO uretim_emirleri_fason_hareketi (die_id, yon, adet, hurda_adet, kisi_id, zaman) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
    [h.dieId, h.yon, h.adet, h.hurda, h.kisiId],
  );
}

export function dieTamamla(db: Db, id: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE uretim_emirleri_dis_islem_emri SET tamamlanma_zamani = now(), tamamlayan_kisi_id = $2, surum = surum + 1
      WHERE id = $1 AND is_emri_id IS NULL AND tamamlanma_zamani IS NULL AND iptal_zamani IS NULL RETURNING id`,
    [id, kisiId],
  );
}

export function dieIptal(db: Db, id: number, kisiId: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE uretim_emirleri_dis_islem_emri SET iptal_zamani = now(), iptal_eden_kisi_id = $2, surum = surum + 1
      WHERE id = $1 AND surum = $3 AND is_emri_id IS NULL AND tamamlanma_zamani IS NULL AND iptal_zamani IS NULL RETURNING id`,
    [id, kisiId, surum],
  );
}

// Elle açmada adımın emir ve kaynak bilgisi; kilit sırası emir, sonra iş emri (terminal komutlarıyla aynı).
export function isEmriFasonBilgisi(db: Db, isEmriId: number): Promise<{ id: number; uretimEmriId: number; fasonFirmaId: number | null } | null> {
  return db.tek(
    'SELECT i.id, i.uretim_emri_id AS "uretimEmriId", i.fason_firma_id AS "fasonFirmaId" FROM uretim_emirleri_is_emri i WHERE i.id = $1',
    [isEmriId],
  );
}
