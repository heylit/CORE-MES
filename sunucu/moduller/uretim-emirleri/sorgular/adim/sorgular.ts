import type { Db } from '#cekirdek/db.ts';
import type { TalimatAsamasi } from '#paylasilan/sozlesme/talimat-asamasi.ts';
import { ISO, TERMINAL_IS_EMRI } from '../ortak/sorgular.ts';

export interface AdimSatiri {
  id: number;
  sira: number;
  ad: string;
  aciklama: string | null;
  asama: TalimatAsamasi;
  zorunlu: boolean;
  kontrol: unknown;
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
  kontrol: object | null = null, zorunlu = false,
): Promise<void> {
  await db.sorgu(
    'INSERT INTO emir_adimi (emir_id, sira, ad, aciklama, is_emri_id, asama, kontrol, zorunlu) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)',
    [emirId, sira, ad, aciklama, isEmriId, asama, kontrol === null ? null : JSON.stringify(kontrol), zorunlu],
  );
}

// Güncel durum son olaydan türer; geri alınmış adımda tamamlayan ve zaman yoktur.
export function adimlariGetir(db: Db, emirId: number): Promise<AdimSatiri[]> {
  return db.sorgu<AdimSatiri>(
    `SELECT a.id, a.sira, a.ad, a.aciklama, a.asama, a.zorunlu, a.kontrol, COALESCE(o.olay = 'tamamla', false) AS tamam,
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

// Hazırlık matrisinin "Talimat" maddesi (2227-1): iş emrine kopyalanmış ön hazırlık ve hazırlık adımları ile son olayı tamamla olanlar.
export interface TalimatSayisi { isEmriId: number; toplam: number; tamam: number }
export function talimatHazirlikSayilari(db: Db, isEmriIdleri: readonly number[]): Promise<TalimatSayisi[]> {
  return db.sorgu<TalimatSayisi>(
    `SELECT a.is_emri_id AS "isEmriId", count(*)::int AS toplam, count(*) FILTER (WHERE o.olay = 'tamamla')::int AS tamam
       FROM emir_adimi a
       LEFT JOIN LATERAL (SELECT olay FROM emir_adimi_olayi WHERE adim_id = a.id ORDER BY id DESC LIMIT 1) o ON true
      WHERE a.is_emri_id = ANY($1::int[]) AND a.asama IN ('on_hazirlik', 'hazirlik') GROUP BY a.is_emri_id`,
    [[...isEmriIdleri]],
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

// Notun anahtarı ürün + OP + adım sırasıdır (2098-9 a); rotasız emirde iş emri yoktur, anahtar da yoktur. Rotadan gelen adımda OP,
// numarası değil operasyonun kalıcı kimliğidir (3250 b): OP numarası rotada yeniden dizilse de not aynı operasyonda kalır.
export interface NotAnahtari { malzemeNo: number; opNo: number; operasyonId: number | null }
export function notAnahtari(db: Db, isEmriId: number): Promise<(NotAnahtari & { talimatSurumu: number | null }) | null> {
  return db.tek<NotAnahtari & { talimatSurumu: number | null }>(
    `SELECT e.malzeme_no AS "malzemeNo", ie.op_no AS "opNo", ie.operasyon_id AS "operasyonId", ie.talimat_surumu AS "talimatSurumu"
       FROM uretim_emirleri_is_emri ie JOIN uretim_emri e ON e.id = ie.uretim_emri_id
      WHERE ie.id = $1 AND e.malzeme_no IS NOT NULL`, [isEmriId],
  );
}

// İş emrinin rota operasyonunun gizli kimliği (3250 b): rotadan gelmeyen ya da kimliği eşleşmemiş adımda null.
export function isEmriOperasyonlari(db: Db, isEmriIdleri: readonly number[]): Promise<{ isEmriId: number; operasyonId: number | null }[]> {
  return db.sorgu('SELECT id AS "isEmriId", operasyon_id AS "operasyonId" FROM uretim_emirleri_is_emri WHERE id = ANY($1::int[])', [[...isEmriIdleri]]);
}

export function adimNotuEkle(db: Db, g: NotAnahtari & { emirId: number; sira: number; kisiId: number; metin: string; an: string }): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO emir_adim_notu (emir_id, malzeme_no, op_no, operasyon_id, adim_sira, kisi_id, metin, zaman) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
    [g.emirId, g.malzemeNo, g.opNo, g.operasyonId, g.sira, g.kisiId, g.metin, g.an],
  );
}

export interface AdimNotuSatiri { sira: number; buEmir: boolean; metin: string; kisiId: number; zaman: string; emirId: number }
// Her sıra için başka emirdeki son not ve bu emirdeki son not.
export function adimNotlari(db: Db, emirId: number, a: NotAnahtari, siralar: readonly number[]): Promise<AdimNotuSatiri[]> {
  return db.sorgu<AdimNotuSatiri>(
    `SELECT DISTINCT ON (n.adim_sira, n.emir_id = $1) n.adim_sira AS sira, n.emir_id = $1 AS "buEmir", n.metin, n.kisi_id AS "kisiId",
            ${ISO('n.zaman')} AS zaman, n.emir_id AS "emirId"
       FROM emir_adim_notu n
      WHERE (CASE WHEN $5::int IS NULL THEN n.malzeme_no = $2 AND n.op_no = $3 ELSE n.operasyon_id = $5 END) AND n.adim_sira = ANY($4::int[])
      ORDER BY n.adim_sira, n.emir_id = $1, n.id DESC`,
    [emirId, a.malzemeNo, a.opNo, [...siralar], a.operasyonId],
  );
}

// 3338-4 a: atlanan zorunlu talimatlar. Adımlar bu emrin ve aynı iş emrinin değilse boş döner (çağıran reddeder).
export function atlananAdimlar(db: Db, emirId: number, adimIdler: readonly number[]): Promise<{ id: number; ad: string; isEmriId: number | null }[]> {
  return db.sorgu(
    'SELECT id, ad, is_emri_id AS "isEmriId" FROM emir_adimi WHERE emir_id = $1 AND id = ANY($2::int[]) ORDER BY sira',
    [emirId, [...adimIdler]],
  );
}
export async function talimatAtlamaEkle(db: Db, isEmriId: number, kisiId: number, eylem: 'baslat' | 'bitir', maddeler: readonly string[]): Promise<number> {
  const r = await db.tek<{ id: number }>(
    'INSERT INTO emir_adimi_talimat_atlama (is_emri_id, kisi_id, eylem, maddeler) VALUES ($1, $2, $3, $4::text[]) RETURNING id',
    [isEmriId, kisiId, eylem, [...maddeler]],
  );
  return r!.id;
}
export interface TalimatAtlamaSatiri { isEmriId: number; kisiId: number; eylem: 'baslat' | 'bitir'; maddeler: string[]; zaman: string }
export function talimatAtlamalari(db: Db, isEmriIdleri: readonly number[]): Promise<TalimatAtlamaSatiri[]> {
  return db.sorgu<TalimatAtlamaSatiri>(
    `SELECT is_emri_id AS "isEmriId", kisi_id AS "kisiId", eylem, maddeler, ${ISO('zaman')} AS zaman
       FROM emir_adimi_talimat_atlama WHERE is_emri_id = ANY($1::int[]) ORDER BY id`,
    [[...isEmriIdleri]],
  );
}
