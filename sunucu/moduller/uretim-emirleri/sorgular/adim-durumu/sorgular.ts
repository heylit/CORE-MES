import type { Db } from '#cekirdek/db.ts';
import { ISO, KALDIRILMAMIS } from '../ortak/sorgular.ts';

// Adım Durumu (2893): elle statü ve elle hazırlık onayı defterleri. Satır silinmez; açık kayıt iş emri (ve madde) başına son satırdır.
export interface ElleStatuSatiri {
  id: number; isEmriId: number; olay: 'yaz' | 'kaldir'; statu: string | null; sistemStatusu: string | null; aciklama: string | null;
  kisiId: number; zaman: string;
}
// 3322: olay 'onay' elle hazır, 'eksik' elle hazır değil, 'kaldir' elle değeri kaldırır (otomatiğe döner).
export type HazirlikOnayOlayi = 'onay' | 'eksik' | 'kaldir';
export interface HazirlikOnaySatiri {
  id: number; isEmriId: number; madde: string; olay: HazirlikOnayOlayi; sistemHali: string | null; gerekce: string | null;
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
  db: Db, o: { isEmriId: number; madde: string; olay: HazirlikOnayOlayi; sistemHali: string | null; gerekce: string | null; onaylananSurum: string | null; kisiId: number },
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

// 3249 b: iş emrinin ön hazırlık ve hazırlık listesi (emir_adimi), son olayı, kanıtı ve ofisten eklenmişse ekleyeniyle.
export interface ListeSatiri {
  id: number; isEmriId: number; sira: number; ad: string; aciklama: string | null; asama: 'on_hazirlik' | 'hazirlik';
  sonOlay: 'tamamla' | 'geri-al' | null; olayKisiId: number | null; olayZamani: string | null; olayKaynagi: string | null;
  kanitOlcum: number | null; kanitSecim: string | null; kanitFoto: string | null; ekleyenId: number | null; eklenme: string | null;
  kontrol: unknown;
}
export function listeSatirlari(db: Db, isEmriIdleri: readonly number[]): Promise<ListeSatiri[]> {
  return db.sorgu<ListeSatiri>(
    `SELECT a.id, a.is_emri_id AS "isEmriId", a.sira, a.ad, a.aciklama, a.asama, o.olay AS "sonOlay", o.kisi_id AS "olayKisiId",
            CASE WHEN o.id IS NULL THEN NULL ELSE ${ISO('o.zaman')} END AS "olayZamani", o.kaynak AS "olayKaynagi",
            k.olcum::float8 AS "kanitOlcum", k.secim AS "kanitSecim", k.foto_ozet AS "kanitFoto",
            a.ekleyen_id AS "ekleyenId", CASE WHEN a.eklenme IS NULL THEN NULL ELSE ${ISO('a.eklenme')} END AS eklenme, a.kontrol
       FROM emir_adimi a
       LEFT JOIN LATERAL (SELECT id, olay, kisi_id, zaman, kaynak FROM emir_adimi_olayi WHERE adim_id = a.id ORDER BY id DESC LIMIT 1) o ON true
       LEFT JOIN emir_adimi_kaniti k ON k.olay_id = o.id AND o.olay = 'tamamla'
      WHERE a.is_emri_id = ANY($1::int[]) AND a.asama IN ('on_hazirlik', 'hazirlik') AND ${KALDIRILMAMIS('a')}
      ORDER BY a.is_emri_id, a.sira`,
    [[...isEmriIdleri]],
  );
}

export async function listeOlayiEkle(db: Db, adimId: number, kisiId: number, olay: 'tamamla' | 'geri-al' | 'kaldir'): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay, kaynak) VALUES ($1, $2, $3, 'adim-durumu') RETURNING id`, [adimId, kisiId, olay],
  );
  if (satir === null) throw new Error('Liste olayı yazılamadı.');
  return satir.id;
}

// Sıra iş emrinin listesinin sonudur; iş emri satırı çağıranca kilitlidir (isEmriKilitle), iki ekleme aynı sırayı almaz.
export async function listeMaddesiEkle(
  db: Db, m: { emirId: number; isEmriId: number; ad: string; asama: 'on_hazirlik' | 'hazirlik'; kisiId: number; kontrol: object | null },
): Promise<void> {
  await db.sorgu(
    `INSERT INTO emir_adimi (emir_id, is_emri_id, sira, ad, asama, ekleyen_id, eklenme, kontrol)
     SELECT $1, $2, COALESCE(max(sira), 0) + 1, $3, $4, $5, now(), $6::jsonb FROM emir_adimi WHERE emir_id = $1 AND is_emri_id = $2`,
    [m.emirId, m.isEmriId, m.ad, m.asama, m.kisiId, m.kontrol === null ? null : JSON.stringify(m.kontrol)],
  );
}

// Liste fotoğrafının bağı maddeye aittir: fotoğraf yalnız kendi maddesinin kaydından okunur (dosya tutamağı kayıt anahtarı).
export const listeFotoKaydi = (adimId: number): string => `liste-kaniti:${String(adimId)}`;

// 3494-3 a: Üretim Hazırlık'ın eklediği madde emrin listesindedir. Arkon elle eklenmiş, kontrolsüz (onay) maddeleri görür ve işaretler;
// ölçüm, seçim ve fotoğraf isteyen madde kanıtla Adım Durumu'nda ya da terminalde işaretlenir.
export interface ElleMaddeSatiri {
  id: number; isEmriId: number; ad: string; kisiId: number; zaman: string; tamam: boolean; tamamlayanId: number | null; tamamlanma: string | null;
}
export function elleMaddeler(db: Db, isEmriIdleri: readonly number[]): Promise<ElleMaddeSatiri[]> {
  return db.sorgu<ElleMaddeSatiri>(
    `SELECT a.id, a.is_emri_id AS "isEmriId", a.ad, a.ekleyen_id AS "kisiId", ${ISO('a.eklenme')} AS zaman, COALESCE(o.olay = 'tamamla', false) AS tamam,
            CASE WHEN o.olay = 'tamamla' THEN o.kisi_id END AS "tamamlayanId",
            CASE WHEN o.olay = 'tamamla' THEN ${ISO('o.zaman')} END AS tamamlanma
       FROM emir_adimi a
       LEFT JOIN LATERAL (SELECT olay, kisi_id, zaman FROM emir_adimi_olayi WHERE adim_id = a.id ORDER BY id DESC LIMIT 1) o ON true
      WHERE a.is_emri_id = ANY($1::int[]) AND a.ekleyen_id IS NOT NULL AND a.kontrol IS NULL AND a.asama IN ('on_hazirlik', 'hazirlik')
        AND ${KALDIRILMAMIS('a')}
      ORDER BY a.is_emri_id, a.sira`,
    [[...isEmriIdleri]],
  );
}
export function elleMaddeBul(db: Db, id: number): Promise<{ isEmriId: number; sonOlay: string | null } | null> {
  return db.tek(
    `SELECT a.is_emri_id AS "isEmriId", (SELECT olay FROM emir_adimi_olayi WHERE adim_id = a.id ORDER BY id DESC LIMIT 1) AS "sonOlay"
       FROM emir_adimi a WHERE a.id = $1 AND a.ekleyen_id IS NOT NULL AND a.kontrol IS NULL AND a.asama IN ('on_hazirlik', 'hazirlik')
        AND ${KALDIRILMAMIS('a')}`,
    [id],
  );
}
// İş emri satırı kilitlenir (Adım Durumu'nun eklemesiyle aynı sıra): iki ekleme aynı sırayı almaz. İş emri yoksa null.
export function isEmrininEmriKilitle(db: Db, isEmriId: number): Promise<{ emirId: number } | null> {
  return db.tek('SELECT uretim_emri_id AS "emirId" FROM uretim_emirleri_is_emri WHERE id = $1 FOR UPDATE', [isEmriId]);
}
export async function listeMaddeSayisi(db: Db, isEmriId: number): Promise<number> {
  return (await db.tek<{ n: number }>(
    `SELECT count(*)::int AS n FROM emir_adimi a WHERE a.is_emri_id = $1 AND a.asama IN ('on_hazirlik', 'hazirlik') AND ${KALDIRILMAMIS('a')}`, [isEmriId],
  ))?.n ?? 0;
}
