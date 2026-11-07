import type { Db } from '#cekirdek/db.ts';
import type { TalimatAsamasi } from '#paylasilan/sozlesme/talimat-asamasi.ts';
import { ISO, TERMINAL_IS_EMRI } from '../ortak/sorgular.ts';

export interface AdimSatiri {
  id: number;
  sira: number;
  ad: string;
  aciklama: string | null;
  asama: TalimatAsamasi;
  tamam: boolean;
  tamamlayanId: number | null;
  tamamlanma: string | null;
  isEmriId: number | null;
  kanitOlcum: number | null;
  kanitSecim: string | null;
  kanitFoto: string | null;
}

export async function adimEkle(
  db: Db, emirId: number, sira: number, ad: string, aciklama: string | null, isEmriId: number | null = null, asama: TalimatAsamasi = 'uretim',
): Promise<void> {
  await db.sorgu(
    'INSERT INTO emir_adimi (emir_id, sira, ad, aciklama, is_emri_id, asama) VALUES ($1, $2, $3, $4, $5, $6)', [emirId, sira, ad, aciklama, isEmriId, asama],
  );
}

// Güncel durum son olaydan türer; geri alınmış adımda tamamlayan ve zaman yoktur.
export function adimlariGetir(db: Db, emirId: number): Promise<AdimSatiri[]> {
  return db.sorgu<AdimSatiri>(
    `SELECT a.id, a.sira, a.ad, a.aciklama, a.asama, COALESCE(o.olay = 'tamamla', false) AS tamam,
            CASE WHEN o.olay = 'tamamla' THEN o.kisi_id END AS "tamamlayanId",
            CASE WHEN o.olay = 'tamamla' THEN ${ISO('o.zaman')} END AS tamamlanma,
            a.is_emri_id AS "isEmriId", k.olcum::float8 AS "kanitOlcum", k.secim AS "kanitSecim", k.foto_ozet AS "kanitFoto"
       FROM emir_adimi a
       LEFT JOIN LATERAL (SELECT id, olay, kisi_id, zaman FROM emir_adimi_olayi WHERE adim_id = a.id ORDER BY id DESC LIMIT 1) o ON true
       LEFT JOIN emir_adimi_kaniti k ON k.olay_id = o.id AND o.olay = 'tamamla'
      WHERE a.emir_id = $1 AND a.is_emri_id IS NOT DISTINCT FROM ${TERMINAL_IS_EMRI('$1')} ORDER BY a.sira`,
    [emirId],
  );
}

export async function adimEmirdeVarMi(db: Db, emirId: number, adimId: number): Promise<boolean> {
  return (await db.tek(
    `SELECT 1 AS var FROM emir_adimi WHERE id = $1 AND emir_id = $2 AND is_emri_id IS NOT DISTINCT FROM ${TERMINAL_IS_EMRI('$2')}`, [adimId, emirId],
  )) !== null;
}

export async function adimOlayiEkle(db: Db, adimId: number, kisiId: number, olay: 'tamamla' | 'geri-al', an: string): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    'INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay, zaman) VALUES ($1, $2, $3, $4::timestamptz) RETURNING id', [adimId, kisiId, olay, an],
  );
  if (satir === null) throw new Error('Adım olayı yazılamadı.');
  return satir.id;
}

export function adimKanitiEkle(db: Db, olayId: number, k: { olcum: number | null; secim: string | null; foto: string | null }): Promise<unknown> {
  return db.sorgu('INSERT INTO emir_adimi_kaniti (olay_id, olcum, secim, foto_ozet) VALUES ($1, $2, $3, $4)', [olayId, k.olcum, k.secim, k.foto]);
}

// Notun anahtarı ürün + OP + adım sırasıdır (2098-9 a); rotasız emirde iş emri yoktur, anahtar da yoktur.
export interface NotAnahtari { malzemeNo: number; opNo: number }
export function notAnahtari(db: Db, isEmriId: number): Promise<(NotAnahtari & { talimatSurumu: number | null }) | null> {
  return db.tek<NotAnahtari & { talimatSurumu: number | null }>(
    `SELECT e.malzeme_no AS "malzemeNo", ie.op_no AS "opNo", ie.talimat_surumu AS "talimatSurumu" FROM uretim_emirleri_is_emri ie JOIN uretim_emri e ON e.id = ie.uretim_emri_id
      WHERE ie.id = $1 AND e.malzeme_no IS NOT NULL`, [isEmriId],
  );
}

export function adimNotuEkle(db: Db, g: NotAnahtari & { emirId: number; sira: number; kisiId: number; metin: string; an: string }): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO emir_adim_notu (emir_id, malzeme_no, op_no, adim_sira, kisi_id, metin, zaman) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
    [g.emirId, g.malzemeNo, g.opNo, g.sira, g.kisiId, g.metin, g.an],
  );
}

export interface AdimNotuSatiri { sira: number; buEmir: boolean; metin: string; kisiId: number; zaman: string; emirId: number }
// Her sıra için başka emirdeki son not ve bu emirdeki son not.
export function adimNotlari(db: Db, emirId: number, a: NotAnahtari, siralar: readonly number[]): Promise<AdimNotuSatiri[]> {
  return db.sorgu<AdimNotuSatiri>(
    `SELECT DISTINCT ON (n.adim_sira, n.emir_id = $1) n.adim_sira AS sira, n.emir_id = $1 AS "buEmir", n.metin, n.kisi_id AS "kisiId",
            ${ISO('n.zaman')} AS zaman, n.emir_id AS "emirId"
       FROM emir_adim_notu n
      WHERE n.malzeme_no = $2 AND n.op_no = $3 AND n.adim_sira = ANY($4::int[])
      ORDER BY n.adim_sira, n.emir_id = $1, n.id DESC`,
    [emirId, a.malzemeNo, a.opNo, [...siralar]],
  );
}
