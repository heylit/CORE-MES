import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { DurumMuadili, KaliteMuadili, KapsamTuru, KullanimYeri, MuadilTuru, SetKipi, SetNiteligi, SinirDegeri, SinirNiteligi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { PayTuru } from '#paylasilan/sozlesme/stok-kontrol-sabitleri.ts';
import { KATALOG_AD, KATALOG_DIZI, KATALOG_KALITE, KATALOG_METIN } from '../sorgular.ts';
import type { KuralSatiri, SinirSatiri } from './kurallar.ts';

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
// Grup kapsamlarının seçenekleri ve her birinin hammadde kartı sayısı (iptal dışı); ekran yazım hatası yerine listeden seçer.
export function kapsamSayilari(db: Db): Promise<{ kapsamTuru: Exclude<KapsamTuru, 'kart'>; kapsam: string; kart: number }[]> {
  const parca = (t: Exclude<KapsamTuru, 'kart'>) => `SELECT '${t}' AS "kapsamTuru", ${KAPSAM_IFADESI[t]} AS kapsam, count(*)::int AS kart
    FROM malzeme_katalog_karti k WHERE k.onay_durumu <> 'iptal' AND k.tur = 'hammadde' AND ${KAPSAM_IFADESI[t]} IS NOT NULL GROUP BY 2`;
  return db.sorgu(`${(['aile', 'sinif', 'kalite'] as const).map(parca).join(' UNION ALL ')} ORDER BY 1, 2`);
}
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

export async function kartSurumu(db: Db, no: number): Promise<number | null> {
  return (await db.tek<{ surum: number }>('SELECT surum FROM malzeme_katalog_karti WHERE no = $1', [no]))?.surum ?? null;
}

// Aynı formdaki aktif hammadde kartları (adaylar).
export function zarfAdaylari(db: Db, form: string): Promise<ZarfKartSatiri[]> {
  return db.sorgu<ZarfKartSatiri>(
    `SELECT * FROM (SELECT ${KART_SUTUNLARI} FROM malzeme_katalog_karti k WHERE k.onay_durumu = 'aktif' AND k.tur = 'hammadde') x
      WHERE x.form = $1 ORDER BY x.no`, [form]);
}

// 3463: kabul sınırları. Tablo küçüktür (nitelik başına satır); motor hepsini bir kez okur.
export interface SinirKaydi extends SinirSatiri { id: number; surum: number }
const SINIR_SUTUNLARI = `s.id, s.kapsam_turu AS "kapsamTuru", s.kapsam, s.nitelik, s.degerler, s.alt::float8 AS alt, s.ust::float8 AS ust, s.surum`;

export function siniri(db: Db): Promise<SinirKaydi[]> {
  return db.sorgu<SinirKaydi>(`SELECT ${SINIR_SUTUNLARI} FROM malzeme_kabul_siniri s
    ORDER BY array_position(ARRAY['aile', 'sinif', 'kalite', 'kart'], s.kapsam_turu), s.kapsam, s.nitelik`);
}

export interface SinirYazimi {
  kapsamTuru: KapsamTuru; kapsam: string; nitelik: SinirNiteligi; degerler: readonly SinirDegeri[] | null; alt: number | null; ust: number | null;
}
const sinirDegerleri = (s: SinirYazimi) => [s.kapsamTuru, s.kapsam, s.nitelik, s.degerler === null ? null : JSON.stringify(s.degerler), s.alt, s.ust];

export async function sinirEkle(db: Db, s: SinirYazimi, kisiId: number): Promise<void> {
  await db.sorgu(`INSERT INTO malzeme_kabul_siniri (kapsam_turu, kapsam, nitelik, degerler, alt, ust, guncelleyen_kisi_id)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`, [...sinirDegerleri(s), kisiId]);
}

// Kapsam ve nitelik değişmez (ayrı satır olur); sürüm koşullu.
export async function sinirGuncelle(db: Db, s: SinirYazimi, surum: number, kisiId: number): Promise<boolean> {
  return (await db.tek(`UPDATE malzeme_kabul_siniri SET degerler = $4::jsonb, alt = $5, ust = $6, guncelleyen_kisi_id = $7, guncelleme = now(),
      surum = surum + 1 WHERE kapsam_turu = $1 AND kapsam = $2 AND nitelik = $3 AND surum = $8 RETURNING id`,
  [...sinirDegerleri(s), kisiId, surum])) !== null;
}

export async function sinirVarMi(db: Db, kapsamTuru: KapsamTuru, kapsam: string, nitelik: SinirNiteligi): Promise<boolean> {
  return (await db.tek(`SELECT 1 FROM malzeme_kabul_siniri WHERE kapsam_turu = $1 AND kapsam = $2 AND nitelik = $3`, [kapsamTuru, kapsam, nitelik])) !== null;
}

export async function sinirSil(db: Db, id: number, surum: number): Promise<boolean> {
  return (await db.tek(`DELETE FROM malzeme_kabul_siniri WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum])) !== null;
}

export function sinirGetir(db: Db, id: number): Promise<{ id: number } | null> {
  return db.tek(`SELECT id FROM malzeme_kabul_siniri WHERE id = $1`, [id]);
}

// 3463: eşdeğer kartlar. Grup, ilk bağlanan kartın numarasıdır.
// Bağlama ve çıkarma sırayla yürür: grubu kuran çıkarken grup numarası değişir, eş zamanlı bağlama eski numaraya yazıp grubu bölmesin.
export const esdegerKilidi = (db: Db): Promise<unknown> => db.sorgu("SELECT pg_advisory_xact_lock(hashtext('malzeme_esdeger_bagi'))");
export async function esdegerGrubu(db: Db, no: number, kilitle = false): Promise<number | null> {
  const r = await db.tek<{ grup: number }>(`SELECT grup FROM malzeme_esdeger_bagi WHERE kart_no = $1${kilitle ? ' FOR UPDATE' : ''}`, [no]);
  return r?.grup ?? null;
}

// Grubun iptal olmayan öteki kartları, numara sırasıyla.
export function esdegerler(db: Db, no: number): Promise<{ no: number; kod: string | null; ad: string | null }[]> {
  return db.sorgu(`SELECT k.no, k.stok_kodu AS kod, ${KATALOG_AD.replaceAll('kayit', 'k.kayit')} AS ad
      FROM malzeme_esdeger_bagi b JOIN malzeme_esdeger_bagi o ON o.grup = b.grup AND o.kart_no <> b.kart_no
      JOIN malzeme_katalog_karti k ON k.no = o.kart_no AND k.onay_durumu <> 'iptal'
     WHERE b.kart_no = $1 ORDER BY k.no`, [no]);
}

export async function esdegerEkle(db: Db, no: number, grup: number, kisiId: number): Promise<void> {
  await db.sorgu(`INSERT INTO malzeme_esdeger_bagi (kart_no, grup, ekleyen_kisi_id) VALUES ($1, $2, $3)`, [no, grup, kisiId]);
}

// Kartı gruptan çıkarır; tek kişilik kalan grup da silinir, grubu kuran çıkarsa grup kalan en küçük numaraya geçer.
export async function esdegerCikar(db: Db, no: number, grup: number): Promise<void> {
  await db.sorgu(`DELETE FROM malzeme_esdeger_bagi WHERE kart_no = $1`, [no]);
  await db.sorgu(`DELETE FROM malzeme_esdeger_bagi WHERE grup = $1 AND (SELECT count(*) FROM malzeme_esdeger_bagi WHERE grup = $1) = 1`, [grup]);
  if (no === grup) {
    await db.sorgu(`UPDATE malzeme_esdeger_bagi SET grup = (SELECT min(kart_no) FROM malzeme_esdeger_bagi WHERE grup = $1) WHERE grup = $1`, [grup]);
  }
}

// 3463-1b: verilen kartların eşdeğer grubu (kart dahil, iptal olmayan üyeler); grupta olmayan kart haritada yoktur.
// İptal kart grup dönmez (stok payı almaz); grupta yalnız iptal dışı üyeler sayılır, tek üye kalan grup yoktur.
export async function esdegerUyeleri(db: Db, nolar: readonly number[]): Promise<Map<number, number[]>> {
  if (nolar.length === 0) return new Map();
  const r = await db.sorgu<{ kart_no: number; uyeler: number[] }>(`SELECT b.kart_no, array_agg(o.kart_no ORDER BY o.kart_no) AS uyeler
      FROM malzeme_esdeger_bagi b JOIN malzeme_esdeger_bagi o ON o.grup = b.grup
      JOIN malzeme_katalog_karti k ON k.no = o.kart_no AND k.onay_durumu <> 'iptal'
     WHERE b.kart_no = ANY($1::int[]) GROUP BY b.kart_no`, [[...nolar]]);
  return new Map(r.filter((x) => x.uyeler.length > 1 && x.uyeler.includes(x.kart_no)).map((x) => [x.kart_no, x.uyeler]));
}

// Bağ denetimi için: tür, form, ölçü anahtarları ve stok birimi.
export function esdegerKarti(db: Db, no: number): Promise<{ no: number; tur: string; form: string | null; anahtarlar: string[]; birim: string | null } | null> {
  return db.tek(`SELECT k.no, k.tur, ${KATALOG_METIN('form')} AS form,
      COALESCE((SELECT array_agg(a ORDER BY a) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(k.kayit -> 'dims') = 'object' THEN k.kayit -> 'dims' ELSE '{}'::jsonb END) a), '{}') AS anahtarlar,
      ${KATALOG_METIN('com,birim')} AS birim
    FROM malzeme_katalog_karti k WHERE k.no = $1 AND k.onay_durumu <> 'iptal'`, [no]);
}

// 3572 a: alternatif setleri ve seçili kartlar. Aynı ana kartın yazımları sırayla yürür (sıra ve uyan sayısı tutarlı kalsın).
export const anaKilidi = (db: Db, anaNo: number): Promise<unknown> =>
  db.sorgu("SELECT pg_advisory_xact_lock(hashtext('malzeme_alternatif_seti'), $1)", [anaNo]);

export interface SetKaydi {
  id: number; anaNo: number; ad: string; tur: MuadilTuru; sira: number; kullanimYerleri: KullanimYeri[]; notu: string | null; uyanSayi: number;
  genisOnay: boolean; surum: number; guncelleme: string;
  nitelikler: SetNiteligiKaydi[];
}
export interface SetNiteligiKaydi {
  nitelik: SetNiteligi; kip: SetKipi | null; degerler: string[] | null; alt: number | null; ust: number | null; payAlt: number | null; payUst: number | null;
}
const SET_SUTUNLARI = `t.id, t.ana_no AS "anaNo", t.ad, t.tur, t.sira, t.kullanim_yerleri AS "kullanimYerleri", t.notu, t.uyan_sayi AS "uyanSayi",
  t.genis_onay AS "genisOnay", t.surum, ${zamanMetni('t.guncelleme')} AS guncelleme,
  COALESCE((SELECT json_agg(json_build_object('nitelik', n.nitelik, 'kip', n.kip, 'degerler', n.degerler, 'alt', n.alt::float8, 'ust', n.ust::float8,
       'payAlt', n.pay_alt::float8, 'payUst', n.pay_ust::float8)
     ORDER BY array_position(ARRAY['form', 'kalite', 'durum', 'standart', 'yuzey', 'islem', 'd', 's', 'a', 'b', 't', 'D', 'h', 'l'], n.nitelik))
     FROM malzeme_alternatif_seti_niteligi n WHERE n.set_id = t.id), '[]') AS nitelikler`;

export function setler(db: Db, anaNo: number): Promise<SetKaydi[]> {
  return db.sorgu<SetKaydi>(`SELECT ${SET_SUTUNLARI} FROM malzeme_alternatif_seti t WHERE t.ana_no = $1 ORDER BY t.sira, t.id`, [anaNo]);
}
export function butunSetler(db: Db): Promise<SetKaydi[]> {
  return db.sorgu<SetKaydi>(`SELECT ${SET_SUTUNLARI} FROM malzeme_alternatif_seti t ORDER BY t.ana_no, t.sira, t.id`);
}
export function setGetir(db: Db, id: number): Promise<{ id: number; anaNo: number; surum: number } | null> {
  return db.tek(`SELECT id, ana_no AS "anaNo", surum FROM malzeme_alternatif_seti WHERE id = $1`, [id]);
}

export async function sonrakiSira(db: Db, anaNo: number): Promise<number> {
  const r = await db.tek<{ sira: number }>(`SELECT COALESCE(max(sira) + 1, 0)::int AS sira FROM (
      SELECT sira FROM malzeme_alternatif_seti WHERE ana_no = $1 UNION ALL SELECT sira FROM malzeme_secili_alternatif WHERE ana_no = $1 AND sira IS NOT NULL) x`, [anaNo]);
  return r!.sira;
}

export interface SetYazimi { anaNo: number; ad: string; tur: MuadilTuru; kullanimYerleri: readonly KullanimYeri[]; notu: string | null; uyanSayi: number; genisOnay: boolean }

export async function setEkle(db: Db, s: SetYazimi, sira: number, kisiId: number): Promise<number> {
  const r = await db.tek<{ id: number }>(`INSERT INTO malzeme_alternatif_seti (ana_no, ad, tur, sira, kullanim_yerleri, notu, uyan_sayi, genis_onay, guncelleyen_kisi_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, [s.anaNo, s.ad, s.tur, sira, [...s.kullanimYerleri], s.notu, s.uyanSayi, s.genisOnay, kisiId]);
  return r!.id;
}

// Ana kart değişmez; sürüm koşullu. Nitelik satırları ayrıca yeniden yazılır, setin sürümü yine artar.
export async function setGuncelle(db: Db, id: number, s: SetYazimi, surum: number, kisiId: number): Promise<boolean> {
  return (await db.tek(`UPDATE malzeme_alternatif_seti SET ad = $3, tur = $4, kullanim_yerleri = $5, notu = $6, uyan_sayi = $7, genis_onay = $8,
      guncelleyen_kisi_id = $9, guncelleme = now(), surum = surum + 1
    WHERE id = $1 AND ana_no = $2 AND surum = $10 RETURNING id`,
  [id, s.anaNo, s.ad, s.tur, [...s.kullanimYerleri], s.notu, s.uyanSayi, s.genisOnay, kisiId, surum])) !== null;
}

// Değişmeyen nitelik satırına dokunulmaz (Geçmiş yalnız değişeni gösterir).
export interface SetNiteligiYazimi {
  nitelik: SetNiteligi; kip?: SetKipi | null; degerler: readonly string[] | null; alt: number | null; ust: number | null; payAlt?: number | null; payUst?: number | null;
}
export async function setNitelikleriYaz(db: Db, anaNo: number, id: number, n: readonly SetNiteligiYazimi[]): Promise<void> {
  await db.sorgu(`DELETE FROM malzeme_alternatif_seti_niteligi WHERE set_id = $1 AND NOT (nitelik = ANY($2::text[]))`, [id, n.map((x) => x.nitelik)]);
  for (const x of n) {
    await db.sorgu(`INSERT INTO malzeme_alternatif_seti_niteligi (set_id, nitelik, kip, degerler, alt, ust, pay_alt, pay_ust, ana_no)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (set_id, nitelik) DO UPDATE SET kip = EXCLUDED.kip, degerler = EXCLUDED.degerler, alt = EXCLUDED.alt, ust = EXCLUDED.ust,
        pay_alt = EXCLUDED.pay_alt, pay_ust = EXCLUDED.pay_ust
      WHERE (malzeme_alternatif_seti_niteligi.kip, malzeme_alternatif_seti_niteligi.degerler, malzeme_alternatif_seti_niteligi.alt,
          malzeme_alternatif_seti_niteligi.ust, malzeme_alternatif_seti_niteligi.pay_alt, malzeme_alternatif_seti_niteligi.pay_ust)
        IS DISTINCT FROM (EXCLUDED.kip, EXCLUDED.degerler, EXCLUDED.alt, EXCLUDED.ust, EXCLUDED.pay_alt, EXCLUDED.pay_ust)`,
    [id, x.nitelik, x.kip ?? null, x.degerler === null ? null : [...x.degerler], x.alt, x.ust, x.payAlt ?? null, x.payUst ?? null, anaNo]);
  }
}

export async function setSil(db: Db, id: number, surum: number): Promise<boolean> {
  return (await db.tek(`DELETE FROM malzeme_alternatif_seti WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum])) !== null;
}

// K5: uyan sayı değişti; sürüm artmaz (kullanıcı yazımı değil), değişiklik defterine düşer.
export async function setUyanSayisiYaz(db: Db, id: number, sayi: number): Promise<void> {
  await db.sorgu(`UPDATE malzeme_alternatif_seti SET uyan_sayi = $2 WHERE id = $1 AND uyan_sayi <> $2`, [id, sayi]);
}

export interface SeciliKaydi {
  no: number; kod: string | null; ad: string | null; iptal: boolean; onerilmez: boolean; tur: MuadilTuru | null; sira: number | null;
  kullanimYerleri: KullanimYeri[] | null; notu: string | null; surum: number;
}
export function secililer(db: Db, anaNo: number): Promise<SeciliKaydi[]> {
  return db.sorgu<SeciliKaydi>(`SELECT k.no, k.stok_kodu AS kod, ${KATALOG_AD.replaceAll('kayit', 'k.kayit')} AS ad, k.onay_durumu <> 'aktif' AS iptal,
      a.onerilmez, a.tur, a.sira, a.kullanim_yerleri AS "kullanimYerleri", a.notu, a.surum
    FROM malzeme_secili_alternatif a JOIN malzeme_katalog_karti k ON k.no = a.alternatif_no
   WHERE a.ana_no = $1 ORDER BY a.onerilmez, a.sira NULLS LAST, k.no`, [anaNo]);
}
export function seciliGetir(db: Db, anaNo: number, alternatifNo: number): Promise<{ onerilmez: boolean; sira: number | null; surum: number } | null> {
  return db.tek(`SELECT onerilmez, sira, surum FROM malzeme_secili_alternatif WHERE ana_no = $1 AND alternatif_no = $2`, [anaNo, alternatifNo]);
}

export interface SeciliYazimi {
  anaNo: number; alternatifNo: number; onerilmez: boolean; tur: MuadilTuru | null; sira: number | null; kullanimYerleri: readonly KullanimYeri[] | null; notu: string | null;
}
const seciliDegerleri = (s: SeciliYazimi) => [s.anaNo, s.alternatifNo, s.onerilmez, s.tur, s.sira, s.kullanimYerleri === null ? null : [...s.kullanimYerleri], s.notu];

export async function seciliEkle(db: Db, s: SeciliYazimi, kisiId: number): Promise<void> {
  await db.sorgu(`INSERT INTO malzeme_secili_alternatif (ana_no, alternatif_no, onerilmez, tur, sira, kullanim_yerleri, notu, guncelleyen_kisi_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [...seciliDegerleri(s), kisiId]);
}
export async function seciliGuncelle(db: Db, s: SeciliYazimi, surum: number, kisiId: number): Promise<boolean> {
  return (await db.tek(`UPDATE malzeme_secili_alternatif SET onerilmez = $3, tur = $4, sira = $5, kullanim_yerleri = $6, notu = $7,
      guncelleyen_kisi_id = $8, guncelleme = now(), surum = surum + 1
    WHERE ana_no = $1 AND alternatif_no = $2 AND surum = $9 RETURNING ana_no`, [...seciliDegerleri(s), kisiId, surum])) !== null;
}
export async function seciliSil(db: Db, anaNo: number, alternatifNo: number, surum: number): Promise<boolean> {
  return (await db.tek(`DELETE FROM malzeme_secili_alternatif WHERE ana_no = $1 AND alternatif_no = $2 AND surum = $3 RETURNING ana_no`,
    [anaNo, alternatifNo, surum])) !== null;
}

// Sıra yazımı sürümü artırmaz: içerik değişmez, açık pencerelerdeki düzenleme eskimesin.
export async function siraYaz(db: Db, anaNo: number, tur: 'set' | 'kart', no: number, sira: number): Promise<boolean> {
  return (await db.tek(tur === 'set'
    ? `UPDATE malzeme_alternatif_seti SET sira = $3 WHERE ana_no = $1 AND id = $2 RETURNING id`
    : `UPDATE malzeme_secili_alternatif SET sira = $3 WHERE ana_no = $1 AND alternatif_no = $2 AND NOT onerilmez RETURNING ana_no`, [anaNo, no, sira])) !== null;
}

// Sete aday kartlar: aktif hammadde, standartları ve son 7 günde onaylanıp onaylanmadığıyla.
// 3593: işlemler kartın opts.islem dizisidir (ısıl işlem, kaplama).
export interface SetAdaySatiri extends ZarfKartSatiri { standartlar: string[]; islemler: string[]; yeni: boolean }
const SET_KART_SUTUNLARI = `${KART_SUTUNLARI},
  ARRAY(SELECT DISTINCT x FROM unnest(${KATALOG_DIZI('stds')} || ARRAY[${KATALOG_METIN('com,std')}]) x WHERE x IS NOT NULL ORDER BY x) AS standartlar,
  ARRAY(SELECT DISTINCT x FROM unnest(${KATALOG_DIZI('opts,islem')}) x ORDER BY x) AS islemler,
  COALESCE(k.onaylama > now() - interval '7 days', false) AS yeni`;
export function setAdaylari(db: Db): Promise<SetAdaySatiri[]> {
  return db.sorgu<SetAdaySatiri>(`SELECT ${SET_KART_SUTUNLARI} FROM malzeme_katalog_karti k WHERE k.onay_durumu = 'aktif' AND k.tur = 'hammadde' ORDER BY k.no`);
}
// Birebir ve Pay'ın izlediği ana kartlar (onayda olan da; iptal dışı).
export function setAnaKartlari(db: Db, nolar: readonly number[]): Promise<SetAdaySatiri[]> {
  return db.sorgu<SetAdaySatiri>(`SELECT ${SET_KART_SUTUNLARI} FROM malzeme_katalog_karti k WHERE k.no = ANY($1::int[]) AND k.onay_durumu <> 'iptal'`, [[...nolar]]);
}

// Seçili kart için: var mı, aktif mi, eşdeğer grubunda mı (ana kartla).
export function seciliAdayi(db: Db, anaNo: number, no: number): Promise<{ aktif: boolean; esdeger: boolean } | null> {
  return db.tek(`SELECT k.onay_durumu = 'aktif' AS aktif,
      EXISTS (SELECT 1 FROM malzeme_esdeger_bagi a JOIN malzeme_esdeger_bagi b ON b.grup = a.grup WHERE a.kart_no = $1 AND b.kart_no = k.no) AS esdeger
    FROM malzeme_katalog_karti k WHERE k.no = $2 AND k.onay_durumu <> 'iptal'`, [anaNo, no]);
}
