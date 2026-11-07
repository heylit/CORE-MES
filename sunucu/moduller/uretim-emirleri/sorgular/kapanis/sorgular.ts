import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import type { EmirTuru, HataliKarari } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ARAMA, ISO, NULLU_ISO } from '../ortak/sorgular.ts';

/* ---------------- hatalı parça (1034) ---------------- */

export interface HataliKaydiSatiri {
  id: number;
  uretimEmriId: number;
  emirNo: string;
  parcaNo: string;
  parcaAd: string;
  isEmriId: number;
  opNo: number;
  isEmriAd: string;
  hedefEmirId: number;
  hedefEmirNo: string;
  kaliteIsEmriId: number;
  reworkIsEmriId: number | null;
  tekrarIsEmriId: number | null;
  hurdaNedeniId: number;
  adet: number;
  aciklama: string | null;
  kisiId: number;
  zaman: string;
  karar: 'rework' | 'hurda' | 'red' | null;
  kararKisiId: number | null;
  kararZamani: string | null;
  kararNotu: string | null;
  ncrKimlik: string | null;
}

export interface HataliKaydiYazisi {
  uretimEmriId: number; isEmriId: number; hedefEmirId: number; kaliteIsEmriId: number; reworkIsEmriId: number; tekrarIsEmriId: number | null;
  hurdaNedeniId: number; adet: number; aciklama: string | null; kisiId: number; an: string;
}

export async function hataliKaydiEkle(db: Db, y: HataliKaydiYazisi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emirleri_hatali_kaydi
       (uretim_emri_id, is_emri_id, hedef_emir_id, kalite_is_emri_id, rework_is_emri_id, tekrar_is_emri_id, hurda_nedeni_id, adet, aciklama, kisi_id, zaman)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz) RETURNING id`,
    [y.uretimEmriId, y.isEmriId, y.hedefEmirId, y.kaliteIsEmriId, y.reworkIsEmriId, y.tekrarIsEmriId, y.hurdaNedeniId, y.adet, y.aciklama, y.kisiId, y.an],
  );
  if (satir === null) throw new Error('Hatalı parça kaydı eklenemedi.');
  return satir.id;
}

const HATALI = `h.id, h.uretim_emri_id AS "uretimEmriId", e.emir_no AS "emirNo", e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd",
  h.is_emri_id AS "isEmriId", i.op_no AS "opNo", i.ad AS "isEmriAd", h.hedef_emir_id AS "hedefEmirId", he.emir_no AS "hedefEmirNo",
  h.kalite_is_emri_id AS "kaliteIsEmriId", h.rework_is_emri_id AS "reworkIsEmriId", h.tekrar_is_emri_id AS "tekrarIsEmriId",
  h.hurda_nedeni_id AS "hurdaNedeniId", h.adet, h.aciklama,
  h.kisi_id AS "kisiId", ${ISO('h.zaman')} AS zaman, h.karar, h.karar_kisi_id AS "kararKisiId", ${NULLU_ISO('h.karar_zamani')} AS "kararZamani",
  h.karar_notu AS "kararNotu", h.ncr_kimlik AS "ncrKimlik"`;
const HATALI_KAYNAK = `uretim_emirleri_hatali_kaydi h JOIN uretim_emri e ON e.id = h.uretim_emri_id
  JOIN uretim_emirleri_is_emri i ON i.id = h.is_emri_id JOIN uretim_emri he ON he.id = h.hedef_emir_id`;

// Kilit yalnız kayıt satırını tutar (FOR UPDATE OF h): emirler karar komutunda kendi sırasıyla kilitlenir.
export function hataliKaydiBul(db: Db, id: number, kilit = false): Promise<HataliKaydiSatiri | null> {
  return db.tek<HataliKaydiSatiri>(`SELECT ${HATALI} FROM ${HATALI_KAYNAK} WHERE h.id = $1${kilit ? ' FOR UPDATE OF h' : ''}`, [id]);
}

export const HATALI_LISTE_SINIRI = 500;

// Açık kayıtlar (kararsız) eskiden yeniye; bütün kayıtlar yeniden eskiye, sınırlı. Emir verilirse o emrin ya da onu taşıyan kolun kaydı.
// 1207 c: GKK adımında verilen nedenlerle (Firmada hurda, Firmadan gelmedi) yazılmış hatalı adet; kararından bağımsız.
export async function adimHataliAdedi(db: Db, isEmriId: number, nedenIdleri: readonly number[]): Promise<number> {
  if (nedenIdleri.length === 0) return 0;
  const satir = await db.tek<{ adet: number }>(
    `SELECT COALESCE(sum(adet), 0)::int AS adet FROM uretim_emirleri_hatali_kaydi WHERE is_emri_id = $1 AND hurda_nedeni_id = ANY($2::int[])`,
    [isEmriId, [...nedenIdleri]],
  );
  return satir?.adet ?? 0;
}

export function hataliKayitlariGetir(db: Db, s: { acik: boolean; emirId: number | null }): Promise<HataliKaydiSatiri[]> {
  return db.sorgu<HataliKaydiSatiri>(
    `SELECT ${HATALI} FROM ${HATALI_KAYNAK}
      WHERE (NOT $1::boolean OR h.karar IS NULL) AND ($2::int IS NULL OR h.uretim_emri_id = $2 OR h.hedef_emir_id = $2)
      ORDER BY CASE WHEN $1::boolean THEN h.zaman END, CASE WHEN NOT $1::boolean THEN h.zaman END DESC, h.id
      LIMIT ${HATALI_LISTE_SINIRI}`,
    [s.acik, s.emirId],
  );
}

export function hataliKarariYaz(
  db: Db, id: number, k: { karar: HataliKarari; kisiId: number; an: string; not: string | null; ncrKimlik: string | null },
): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_hatali_kaydi
        SET karar = $2, karar_kisi_id = $3, karar_zamani = $4::timestamptz, karar_notu = $5, ncr_kimlik = $6,
            rework_is_emri_id = CASE WHEN $2 = 'rework' THEN rework_is_emri_id END, tekrar_is_emri_id = CASE WHEN $2 = 'rework' THEN tekrar_is_emri_id END
      WHERE id = $1 AND karar IS NULL`,
    [id, k.karar, k.kisiId, k.an, k.not, k.ncrKimlik],
  );
}

// Kararı bekleyen kalite adımı terminalden başlatılmaz (başlatma denetimi).
export async function acikKaliteAdimiMi(db: Db, isEmriId: number): Promise<boolean> {
  return (await db.tek<{ var: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM uretim_emirleri_hatali_kaydi WHERE kalite_is_emri_id = $1 AND karar IS NULL) AS var', [isEmriId],
  ))!.var;
}

export function reworkAdimiKaydi(db: Db, isEmriId: number): Promise<{ id: number; karar: 'rework' | 'hurda' | 'red' | null } | null> {
  return db.tek('SELECT id, karar FROM uretim_emirleri_hatali_kaydi WHERE rework_is_emri_id = $1', [isEmriId]);
}

// ---------- Onaylı kapanış (1072 a) ----------

export interface KapanisSatiri {
  uretimEmriId: number;
  durum: 'acik' | 'tamam';
  eski: boolean;
  tur: number;
  kaliteKisiId: number | null;
  kaliteZamani: string | null;
  mudurKisiId: number | null;
  mudurZamani: string | null;
  surum: number;
}
const KAPANIS = `k.uretim_emri_id AS "uretimEmriId", k.durum, k.eski, k.tur, k.kalite_kisi_id AS "kaliteKisiId",
  ${NULLU_ISO('k.kalite_zamani')} AS "kaliteZamani", k.mudur_kisi_id AS "mudurKisiId", ${NULLU_ISO('k.mudur_zamani')} AS "mudurZamani", k.surum`;

export function kapanisBul(db: Db, id: number, kilit = false): Promise<KapanisSatiri | null> {
  return db.tek<KapanisSatiri>(`SELECT ${KAPANIS} FROM uretim_emirleri_kapanis k WHERE k.uretim_emri_id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
}

// Emir bitince açılır; aynı emir ikinci kez bitmez, yine de var olan kayda dokunulmaz.
export function kapanisAc(db: Db, id: number): Promise<unknown> {
  return db.sorgu('INSERT INTO uretim_emirleri_kapanis (uretim_emri_id) VALUES ($1) ON CONFLICT (uretim_emri_id) DO NOTHING', [id]);
}

// Onay sütunları sabit eşlemeden gelir; tür SQL'e kullanıcıdan yazılmaz.
const ONAY_SUTUNU = { kalite: ['kalite_kisi_id', 'kalite_zamani'], mudur: ['mudur_kisi_id', 'mudur_zamani'] } as const;
export async function kapanisOnayYaz(db: Db, id: number, surum: number, tur: 'kalite' | 'mudur', kisiId: number): Promise<boolean> {
  const [kisi, zaman] = ONAY_SUTUNU[tur];
  return (await db.tek(
    `UPDATE uretim_emirleri_kapanis SET ${kisi} = $3, ${zaman} = now(), surum = surum + 1
      WHERE uretim_emri_id = $1 AND surum = $2 AND durum = 'acik' AND ${kisi} IS NULL RETURNING surum`, [id, surum, kisiId],
  )) !== null;
}

export async function kapanisTamamla(db: Db, id: number): Promise<boolean> {
  return (await db.tek(
    `UPDATE uretim_emirleri_kapanis SET durum = 'tamam', tamamlanma = now(), surum = surum + 1
      WHERE uretim_emri_id = $1 AND durum = 'acik' AND kalite_kisi_id IS NOT NULL AND mudur_kisi_id IS NOT NULL RETURNING surum`, [id],
  )) !== null;
}

// Ret verilmiş onayları düşürür; muafiyet ise yalnız sürümü artırır (istemcinin okuduğu kapanış eskir).
export async function kapanisOnaylariniDusur(db: Db, id: number, surum: number): Promise<boolean> {
  return (await db.tek(
    `UPDATE uretim_emirleri_kapanis SET kalite_kisi_id = NULL, kalite_zamani = NULL, mudur_kisi_id = NULL, mudur_zamani = NULL, surum = surum + 1
      WHERE uretim_emri_id = $1 AND surum = $2 AND durum = 'acik' RETURNING surum`, [id, surum],
  )) !== null;
}
export async function kapanisSurumuArtir(db: Db, id: number, surum: number): Promise<boolean> {
  return (await db.tek(
    `UPDATE uretim_emirleri_kapanis SET surum = surum + 1 WHERE uretim_emri_id = $1 AND surum = $2 AND durum = 'acik' RETURNING surum`, [id, surum],
  )) !== null;
}

// 1080 a: geri açma yeni tur başlatır; onaylar ve göç öncesi işareti düşer, iki onay yeniden gerekir.
export async function kapanisGeriAc(db: Db, id: number, surum: number): Promise<boolean> {
  return (await db.tek(
    `UPDATE uretim_emirleri_kapanis SET durum = 'acik', eski = false, tur = tur + 1, tamamlanma = NULL, kalite_kisi_id = NULL, kalite_zamani = NULL,
            mudur_kisi_id = NULL, mudur_zamani = NULL, surum = surum + 1
      WHERE uretim_emri_id = $1 AND surum = $2 AND durum = 'tamam' RETURNING surum`, [id, surum],
  )) !== null;
}

export interface KapanisMuafiyetSatiri { madde: string; kisiId: number; gerekce: string; zaman: string }
export function kapanisMuafiyetleri(db: Db, id: number, tur: number): Promise<KapanisMuafiyetSatiri[]> {
  return db.sorgu<KapanisMuafiyetSatiri>(
    `SELECT madde, kisi_id AS "kisiId", gerekce, ${ISO('zaman')} AS zaman FROM uretim_emirleri_kapanis_muafiyeti
      WHERE uretim_emri_id = $1 AND tur = $2 ORDER BY id`, [id, tur],
  );
}
export function kapanisMuafiyetiEkle(db: Db, m: { id: number; tur: number; madde: string; kisiId: number; gerekce: string }): Promise<unknown> {
  return db.sorgu(
    'INSERT INTO uretim_emirleri_kapanis_muafiyeti (uretim_emri_id, tur, madde, kisi_id, gerekce) VALUES ($1, $2, $3, $4, $5)',
    [m.id, m.tur, m.madde, m.kisiId, m.gerekce],
  );
}

export interface KapanisDefterSatiri { olay: string; kisiId: number; zaman: string; gerekce: string | null; madde: string | null }
export function kapanisDefteri(db: Db, id: number): Promise<KapanisDefterSatiri[]> {
  return db.sorgu<KapanisDefterSatiri>(
    `SELECT olay, kisi_id AS "kisiId", ${ISO('zaman')} AS zaman, gerekce, madde FROM uretim_emirleri_kapanis_defteri
      WHERE uretim_emri_id = $1 ORDER BY id`, [id],
  );
}
export function kapanisDefterineYaz(db: Db, d: { id: number; olay: string; kisiId: number; gerekce: string | null; madde: string | null }): Promise<unknown> {
  return db.sorgu(
    'INSERT INTO uretim_emirleri_kapanis_defteri (uretim_emri_id, olay, kisi_id, gerekce, madde) VALUES ($1, $2, $3, $4, $5)',
    [d.id, d.olay, d.kisiId, d.gerekce, d.madde],
  );
}

// Liste: açık kapanışlar en eski biten önce (aşama maddelerle servis'te hesaplanır, bu yüzden açıklar sayfalanmadan gelir);
// tamamlananlar sayfalı, son tamamlanan önce.
export interface KapanisEmirSatiri extends KapanisSatiri {
  emirNo: string; parcaNo: string; parcaAd: string; adet: number; saglamAdet: number; bitis: string; emirTuru: EmirTuru;
}
const KAPANIS_EMIR = `${KAPANIS}, e.emir_no AS "emirNo", e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", e.adet,
  COALESCE(e.saglam_adet, 0) AS "saglamAdet", ${ISO('COALESCE(e.bitis, k.acilis)')} AS bitis, e.emir_turu AS "emirTuru"
  FROM uretim_emirleri_kapanis k JOIN uretim_emri e ON e.id = k.uretim_emri_id`;
export function kapanisEmriBul(db: Db, id: number): Promise<KapanisEmirSatiri | null> {
  return db.tek<KapanisEmirSatiri>(`SELECT ${KAPANIS_EMIR} WHERE k.uretim_emri_id = $1`, [id]);
}
export function acikKapanislar(db: Db, ara: string | null): Promise<KapanisEmirSatiri[]> {
  return db.sorgu<KapanisEmirSatiri>(`SELECT ${KAPANIS_EMIR} WHERE k.durum = 'acik' AND ${ARAMA('1')} ORDER BY e.bitis NULLS LAST, e.id`, [ara]);
}
export async function tamamKapanisSay(db: Db, ara: string | null): Promise<number> {
  return (await db.tek<{ n: number }>(
    `SELECT count(*)::int AS n FROM uretim_emirleri_kapanis k JOIN uretim_emri e ON e.id = k.uretim_emri_id WHERE k.durum = 'tamam' AND ${ARAMA('1')}`, [ara],
  ))?.n ?? 0;
}
export function tamamKapanislar(db: Db, ara: string | null, d: Dilim): Promise<KapanisEmirSatiri[]> {
  return db.sorgu<KapanisEmirSatiri>(
    `SELECT ${KAPANIS_EMIR} WHERE k.durum = 'tamam' AND ${ARAMA('1')} ORDER BY k.tamamlanma DESC, e.id DESC LIMIT $2 OFFSET $3`, [ara, d.sinir, d.atla],
  );
}

// Parti kolları (hatalı parça, bölme) bitmeden ana emrin parçası üretimdedir.
export async function acikKolSayisi(db: Db, id: number): Promise<number> {
  return (await db.tek<{ n: number }>(
    "SELECT count(*)::int AS n FROM uretim_emri WHERE ust_emir_id = $1 AND durum NOT IN ('bitti', 'iptal')", [id],
  ))?.n ?? 0;
}

// 1079 a: duran emir sağlamsız biter; başlama ilk iş emrinin başlamasıdır. Yalnız planlı (adımı çalışmayan) emir; sürümü çağıran
// kilitli satırda denetler (bekleyen adımların silinmesi sürümü artırabilir).
export async function saglamsizBitir(db: Db, id: number): Promise<boolean> {
  return (await db.tek(
    `UPDATE uretim_emri SET durum = 'bitti', istasyon_id = NULL, saglam_adet = 0, bitis = now(), surum = surum + 1,
            baslama = (SELECT min(baslama) FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1)
      WHERE id = $1 AND durum = 'planli' RETURNING id`, [id],
  )) !== null;
}

export interface KapanisDurumSatiri { uretimEmriId: number; durum: 'acik' | 'tamam'; saglamAdet: number }
export function kapanisDurumlari(db: Db, idler: readonly number[]): Promise<KapanisDurumSatiri[]> {
  return db.sorgu<KapanisDurumSatiri>(
    `SELECT k.uretim_emri_id AS "uretimEmriId", k.durum, COALESCE(e.saglam_adet, 0) AS "saglamAdet"
       FROM uretim_emirleri_kapanis k JOIN uretim_emri e ON e.id = k.uretim_emri_id WHERE k.uretim_emri_id = ANY($1::int[])`, [idler],
  );
}
