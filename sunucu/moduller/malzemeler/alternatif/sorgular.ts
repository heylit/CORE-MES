import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { DurumMuadili, KaliteMuadili, KapsamTuru, MuadilTuru } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { PayTuru } from '#paylasilan/sozlesme/stok-kontrol-sabitleri.ts';
import { KATALOG_AD, KATALOG_KALITE, KATALOG_METIN } from '../sorgular.ts';
import type { KuralSatiri } from './kurallar.ts';

export interface KuralKaydi extends KuralSatiri { id: number; kapsamAdi: string | null; surum: number; guncelleyenKisiId: number; guncelleme: string }

const KURAL_SUTUNLARI = `r.id, r.kapsam_turu AS "kapsamTuru", r.kapsam, r.kalite_acik AS "kaliteAcik", r.durum_acik AS "durumAcik",
  r.sartli_acik AS "sartliAcik", r.boy_uzun_kesilir AS "boyUzunKesilir", r.yuzey_serbest AS "yuzeySerbest", r.pay_turu AS "payTuru",
  r.pay_deger::float8 AS "payDeger", r.pay_en_az_mm::float8 AS "payEnAzMm", r.kapali, r.gerekce, r.surum,
  r.guncelleyen_kisi_id AS "guncelleyenKisiId", ${zamanMetni('r.guncelleme')} AS guncelleme`;

export function kurallar(db: Db): Promise<KuralKaydi[]> {
  return db.sorgu<KuralKaydi>(
    `SELECT ${KURAL_SUTUNLARI},
            CASE WHEN r.kapsam_turu = 'kart' THEN (SELECT concat_ws(' ', k.stok_kodu, ${KATALOG_AD.replaceAll('kayit', 'k.kayit')})
                                                     FROM malzeme_katalog_karti k WHERE k.no = r.kapsam::int) END AS "kapsamAdi"
       FROM malzeme_alternatif_kurali r
      ORDER BY array_position(ARRAY['aile', 'sinif', 'kalite', 'kart'], r.kapsam_turu), r.kapsam`);
}

export function kuralGetir(db: Db, id: number): Promise<{ id: number; surum: number } | null> {
  return db.tek(`SELECT id, surum FROM malzeme_alternatif_kurali WHERE id = $1`, [id]);
}

export interface KuralYazimi {
  kapsamTuru: KapsamTuru; kapsam: string; kaliteAcik: boolean | null; durumAcik: boolean | null; sartliAcik: boolean | null;
  boyUzunKesilir: boolean | null; yuzeySerbest: boolean | null; payTuru: PayTuru | null; payDeger: number | null; payEnAzMm: number | null;
  kapali: boolean | null; gerekce: string | null;
}
const yazimDegerleri = (k: KuralYazimi) => [k.kapsamTuru, k.kapsam, k.kaliteAcik, k.durumAcik, k.sartliAcik, k.boyUzunKesilir, k.yuzeySerbest,
  k.payTuru, k.payDeger, k.payEnAzMm, k.kapali, k.gerekce];

export async function kuralEkle(db: Db, k: KuralYazimi, kisiId: number): Promise<number> {
  const r = await db.tek<{ id: number }>(
    `INSERT INTO malzeme_alternatif_kurali (kapsam_turu, kapsam, kalite_acik, durum_acik, sartli_acik, boy_uzun_kesilir, yuzey_serbest,
            pay_turu, pay_deger, pay_en_az_mm, kapali, gerekce, guncelleyen_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`, [...yazimDegerleri(k), kisiId]);
  return r!.id;
}

// Kapsam değişmez (ayrı kural olur); sürüm koşullu.
export async function kuralGuncelle(db: Db, k: KuralYazimi, surum: number, kisiId: number): Promise<number | null> {
  const r = await db.tek<{ id: number }>(
    `UPDATE malzeme_alternatif_kurali SET kalite_acik = $3, durum_acik = $4, sartli_acik = $5, boy_uzun_kesilir = $6, yuzey_serbest = $7,
            pay_turu = $8, pay_deger = $9, pay_en_az_mm = $10, kapali = $11, gerekce = $12, guncelleyen_kisi_id = $13, guncelleme = now(),
            surum = surum + 1
      WHERE kapsam_turu = $1 AND kapsam = $2 AND surum = $14 RETURNING id`, [...yazimDegerleri(k), kisiId, surum]);
  return r?.id ?? null;
}

// Kapsam katalogda geçiyor mu (iptal dışı kart); yanlış yazılan kapsam hiçbir karta uymaz.
const KAPSAM_IFADESI: Record<Exclude<KapsamTuru, 'kart'>, string> = {
  aile: KATALOG_METIN('fam'), sinif: `${KATALOG_METIN('fam')} || '/' || ${KATALOG_METIN('cls')}`, kalite: KATALOG_KALITE,
};
export async function kapsamKatalogdaMi(db: Db, turu: Exclude<KapsamTuru, 'kart'>, kapsam: string): Promise<boolean> {
  return (await db.tek(`SELECT 1 AS v FROM malzeme_katalog_karti k WHERE k.onay_durumu <> 'iptal' AND ${KAPSAM_IFADESI[turu]} = $1 LIMIT 1`, [kapsam])) !== null;
}

export function kuralVarMi(db: Db, kapsamTuru: KapsamTuru, kapsam: string): Promise<{ id: number } | null> {
  return db.tek(`SELECT id FROM malzeme_alternatif_kurali WHERE kapsam_turu = $1 AND kapsam = $2`, [kapsamTuru, kapsam]);
}

export async function kuralSil(db: Db, id: number, surum: number): Promise<boolean> {
  return (await db.tek(`DELETE FROM malzeme_alternatif_kurali WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum])) !== null;
}

export function kaliteMuadilleri(db: Db): Promise<KaliteMuadili[]> {
  return db.sorgu<KaliteMuadili>(`SELECT kalite, muadil, tur, notu, surum FROM malzeme_kalite_muadili ORDER BY kalite, muadil`);
}
export function durumMuadilleri(db: Db): Promise<DurumMuadili[]> {
  return db.sorgu<DurumMuadili>(`SELECT durum, muadil, tur, notu, surum FROM malzeme_durum_muadili ORDER BY durum, muadil`);
}

type MuadilTablosu = 'kalite' | 'durum';
const TABLO: Record<MuadilTablosu, { tablo: string; anahtar: string }> = {
  kalite: { tablo: 'malzeme_kalite_muadili', anahtar: 'kalite' },
  durum: { tablo: 'malzeme_durum_muadili', anahtar: 'durum' },
};

export async function muadilEkle(db: Db, t: MuadilTablosu, deger: string, muadil: string, tur: MuadilTuru, notu: string | null, kisiId: number): Promise<void> {
  const { tablo, anahtar } = TABLO[t];
  await db.sorgu(`INSERT INTO ${tablo} (${anahtar}, muadil, tur, notu, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4, $5)`, [deger, muadil, tur, notu, kisiId]);
}
export async function muadilGuncelle(db: Db, t: MuadilTablosu, deger: string, muadil: string, tur: MuadilTuru, notu: string | null, surum: number, kisiId: number): Promise<boolean> {
  const { tablo, anahtar } = TABLO[t];
  return (await db.tek(
    `UPDATE ${tablo} SET tur = $3, notu = $4, guncelleyen_kisi_id = $5, guncelleme = now(), surum = surum + 1
      WHERE ${anahtar} = $1 AND muadil = $2 AND surum = $6 RETURNING muadil`, [deger, muadil, tur, notu, kisiId, surum])) !== null;
}
export async function muadilVarMi(db: Db, t: MuadilTablosu, deger: string, muadil: string): Promise<boolean> {
  const { tablo, anahtar } = TABLO[t];
  return (await db.tek(`SELECT 1 AS v FROM ${tablo} WHERE ${anahtar} = $1 AND muadil = $2`, [deger, muadil])) !== null;
}
export async function muadilSil(db: Db, t: MuadilTablosu, deger: string, muadil: string, surum: number): Promise<boolean> {
  const { tablo, anahtar } = TABLO[t];
  return (await db.tek(`DELETE FROM ${tablo} WHERE ${anahtar} = $1 AND muadil = $2 AND surum = $3 RETURNING muadil`, [deger, muadil, surum])) !== null;
}

export interface ZarfKartSatiri {
  no: number; tur: string; kod: string | null; ad: string | null; aile: string | null; sinif: string | null; kalite: string | null;
  durum: string | null; yuzey: string | null; form: string | null; olcu: Record<string, unknown> | null;
}
const KART_SUTUNLARI = `k.no, k.tur, k.stok_kodu AS kod, ${KATALOG_AD.replaceAll('kayit', 'k.kayit')} AS ad, ${KATALOG_METIN('fam')} AS aile,
  ${KATALOG_METIN('cls')} AS sinif, ${KATALOG_KALITE} AS kalite, ${KATALOG_METIN('opts,durum')} AS durum, ${KATALOG_METIN('opts,yuzey')} AS yuzey,
  ${KATALOG_METIN('form')} AS form, CASE WHEN jsonb_typeof(k.kayit -> 'dims') = 'object' THEN k.kayit -> 'dims' END AS olcu`;

export function zarfKarti(db: Db, no: number): Promise<ZarfKartSatiri | null> {
  return db.tek<ZarfKartSatiri>(`SELECT ${KART_SUTUNLARI} FROM malzeme_katalog_karti k WHERE k.no = $1 AND k.onay_durumu <> 'iptal'`, [no]);
}

// Aynı formdaki aktif hammadde kartları (adaylar).
export function zarfAdaylari(db: Db, form: string): Promise<ZarfKartSatiri[]> {
  return db.sorgu<ZarfKartSatiri>(
    `SELECT * FROM (SELECT ${KART_SUTUNLARI} FROM malzeme_katalog_karti k WHERE k.onay_durumu = 'aktif' AND k.tur = 'hammadde') x
      WHERE x.form = $1 ORDER BY x.no`, [form]);
}
