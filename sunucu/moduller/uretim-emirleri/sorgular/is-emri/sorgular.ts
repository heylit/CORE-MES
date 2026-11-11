import type { Db } from '#cekirdek/db.ts';
import type { EmirDurumu, EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimOnculu } from '../../kurallar.ts';
import { DAL_VE_ONCUL, ISO, NULLU_ISO, TARIH } from '../ortak/sorgular.ts';

export interface IsEmriSatiri {
  id: number;
  uretimEmriId: number;
  sira: number;
  opNo: number;
  operasyonTipiId: number;
  ad: string;
  makineId: number | null;
  kisiId: number | null;
  fasonFirmaId: number | null;
  // 2874: fason adım, firması henüz seçilmedi (kaynak ve istasyon boş).
  fasonFirmasiz: boolean;
  istasyonId: number | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  terminGun: number | null;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
  firePayiYuzde: string;
  makineKullanimi: 'tek' | 'paralel';
  enKucukParca: number | null;
  yenidenAyar: boolean;
  talimatSurumu: number | null;
  tur: 'rota' | 'rework' | 'tamir' | 'ek';
  ekAciklama: string | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  baslama: string | null;
  bitis: string | null;
  saglamAdet: number | null;
  surum: number;
  // 1248 a: dal satırı olmayan iş emrinde ikisi de null (eski kural); satırı olanda onculler dizidir (boş: dal başı).
  dal: string | null;
  onculler: AdimOnculu[] | null;
  // 1257 a: bir mamul için bu adımda işlenen adet; boş 1.
  adetCarpani: number | null;
}

const IS_EMRI = `i.id, i.uretim_emri_id AS "uretimEmriId", i.sira, i.op_no AS "opNo", i.operasyon_tipi_id AS "operasyonTipiId", i.ad,
  i.makine_id AS "makineId", i.kisi_id AS "kisiId", i.fason_firma_id AS "fasonFirmaId", i.fason_firmasiz AS "fasonFirmasiz", i.istasyon_id AS "istasyonId",
  i.ayar_suresi_dk::text AS "ayarSuresiDk", i.birim_sure_dk::text AS "birimSureDk", i.termin_gun AS "terminGun", i.bagimlilik,
  i.devir_adedi AS "devirAdedi", i.fire_payi_yuzde::text AS "firePayiYuzde", i.makine_kullanimi AS "makineKullanimi",
  i.en_kucuk_parca AS "enKucukParca", i.yeniden_ayar AS "yenidenAyar", i.talimat_surumu AS "talimatSurumu", i.tur, i.ek_aciklama AS "ekAciklama", i.durum,
  ${NULLU_ISO('i.baslama')} AS baslama, ${NULLU_ISO('i.bitis')} AS bitis, i.saglam_adet AS "saglamAdet", i.surum, ${DAL_VE_ONCUL}`;

export function isEmirleriGetir(db: Db, emirIdleri: readonly number[]): Promise<IsEmriSatiri[]> {
  return db.sorgu<IsEmriSatiri>(
    `SELECT ${IS_EMRI} FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = ANY($1::int[]) ORDER BY i.uretim_emri_id, i.sira`,
    [[...emirIdleri]],
  );
}

export function isEmirleriBul(db: Db, idler: readonly number[]): Promise<IsEmriSatiri[]> {
  return db.sorgu<IsEmriSatiri>(`SELECT ${IS_EMRI} FROM uretim_emirleri_is_emri i WHERE i.id = ANY($1::int[])`, [[...idler]]);
}

export function isEmriBul(db: Db, id: number, kilit = false): Promise<IsEmriSatiri | null> {
  return db.tek<IsEmriSatiri>(`SELECT ${IS_EMRI} FROM uretim_emirleri_is_emri i WHERE i.id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
}

// Makine ayrımı denetimi için (393 d): iş emirlerinin emri, emir no'su, op no'su ve durumu.
// 1892 b: iptal edilen emrin iş emirleri 'bekliyor' kalır, canlı plandaki yeri plan yeniden kurulana dek durur; o yer makineyi ayırmaz.
export function isEmriAyrimBilgileri(db: Db, idler: readonly number[]): Promise<{ id: number; uretimEmriId: number; emirNo: string; opNo: number; durum: 'bekliyor' | 'calisiyor' | 'tamam' }[]> {
  return db.sorgu(
    `SELECT i.id, i.uretim_emri_id AS "uretimEmriId", e.emir_no AS "emirNo", i.op_no AS "opNo", i.durum
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = ANY($1::int[]) AND e.durum <> 'iptal'`,
    [[...idler]],
  );
}

// Plan için: verilen iş emirlerinden var olanların emir no'su, op no'su, durumu ve fasonda olup olmadığı (silinen iş emri listede yoktur).
export function isEmriVarliklari(db: Db, idler: readonly number[]): Promise<{ id: number; emirNo: string; opNo: number; durum: string; fason: boolean }[]> {
  return db.sorgu(
    `SELECT i.id, e.emir_no AS "emirNo", i.op_no AS "opNo", i.durum, (i.fason_firma_id IS NOT NULL OR i.fason_firmasiz) AS fason
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = ANY($1::int[])`,
    [[...idler]],
  );
}

// CNC kurulum için: açık (planlı ya da başlamış) emirlerin bitmemiş iş emirleri; istasyon süzgecini çağıran yapar.
export interface AcikIsEmri {
  id: number;
  uretimEmriId: number;
  emirNo: string;
  parcaNo: string;
  parcaAd: string;
  adet: number;
  opNo: number;
  ad: string;
  durum: 'bekliyor' | 'calisiyor';
  istasyonId: number | null;
}

const ACIK_IS_EMRI = `SELECT i.id, e.id AS "uretimEmriId", e.emir_no AS "emirNo", e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", e.adet,
         i.op_no AS "opNo", i.ad, i.durum, i.istasyon_id AS "istasyonId"
    FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
   WHERE NOT e.arsiv AND e.durum IN ('planli', 'basladi') AND i.durum IN ('bekliyor', 'calisiyor')`;

export function acikIsEmirleri(db: Db): Promise<AcikIsEmri[]> {
  return db.sorgu<AcikIsEmri>(`${ACIK_IS_EMRI} ORDER BY e.id, i.sira`);
}

export function acikIsEmri(db: Db, isEmriId: number): Promise<AcikIsEmri | null> {
  return db.tek<AcikIsEmri>(`${ACIK_IS_EMRI} AND i.id = $1`, [isEmriId]);
}

// Plan için: açık (planlı ya da başlamış), arşivde olmayan emirlerin bitmemiş, fason olmayan iş emirleri.
export interface PlanEmriBilgisi {
  id: number;
  emirNo: string;
  malzemeNo: number | null;
  adet: number;
  teslim: string | null;
  oncelik: number;
  acilma: string;
  baslangic: string | null;
  kaynakRotaRevizyonId: number | null;
  ustEmirId: number | null;
  bolunmeSira: number | null;
  birlesmeOpNo: number | null;
  emirTuru: EmirTuru;
  durum: EmirDurumu;
  baslamis: boolean;
  siparisSatiriId: number | null;
}

export function planlanacakIsEmirleriGetir(db: Db, taslakDahil: boolean): Promise<(IsEmriSatiri & { emir: PlanEmriBilgisi })[]> {
  return db.sorgu(
    `SELECT ${IS_EMRI}, json_build_object(
              'id', e.id, 'emirNo', e.emir_no, 'malzemeNo', e.malzeme_no, 'adet', e.adet, 'teslim', ${TARIH('e.teslim')},
              'oncelik', e.oncelik, 'acilma', ${ISO('e.acilma')}, 'baslangic', ${TARIH('e.baslangic')}, 'kaynakRotaRevizyonId', e.kaynak_rota_revizyonu_id, 'ustEmirId', e.ust_emir_id,
              'bolunmeSira', e.bolunme_sira, 'birlesmeOpNo', e.birlesme_op_no, 'emirTuru', e.emir_turu, 'durum', e.durum, 'siparisSatiriId', e.siparis_satiri_id,
              'baslamis', EXISTS (SELECT 1 FROM uretim_emirleri_is_emri b WHERE b.uretim_emri_id = e.id AND b.durum <> 'bekliyor')) AS emir
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
      WHERE NOT e.arsiv AND e.malzeme_no IS NOT NULL AND (e.durum IN ('planli', 'basladi') OR ($1 AND e.durum = 'taslak'))
        AND i.durum <> 'tamam' AND i.fason_firma_id IS NULL AND NOT i.fason_firmasiz
      ORDER BY e.id, i.sira`,
    [taslakDahil],
  );
}

export interface IsEmriYazisi {
  sira: number;
  opNo: number;
  operasyonTipiId: number;
  ad: string;
  makineId: number | null;
  kisiId: number | null;
  fasonFirmaId: number | null;
  // 2874: fason adım, firması henüz seçilmedi (kaynak ve istasyon boş).
  fasonFirmasiz?: boolean;
  istasyonId: number | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  terminGun: number | null;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
  firePayiYuzde: string;
  makineKullanimi: 'tek' | 'paralel';
  enKucukParca: number | null;
  yenidenAyar: boolean;
  talimatSurumu: number | null;
  // Yalnız eklemede: verilmezse rota adımıdır. Güncelleme türü değiştirmez.
  tur?: 'rota' | 'rework' | 'tamir' | 'ek';
  ekAciklama?: string | null;
  // 1476: çok katmanlı emirde adımın düğümü (alt parça), rotadaki op numarası ve kök başına adedi; tek katmanlı emirde yok.
  dugum?: { ad: string; malzemeNo: number; kaynakOpNo: number; birimCarpani: string } | null;
}

const IS_EMRI_DEGERLERI = (y: IsEmriYazisi) => [
  y.sira, y.opNo, y.operasyonTipiId, y.ad, y.makineId, y.kisiId, y.fasonFirmaId, y.istasyonId, y.ayarSuresiDk, y.birimSureDk, y.terminGun,
  y.bagimlilik, y.devirAdedi, y.firePayiYuzde, y.makineKullanimi, y.enKucukParca, y.yenidenAyar, y.talimatSurumu, y.fasonFirmasiz ?? false,
];

export async function isEmriEkle(db: Db, emirId: number, y: IsEmriYazisi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, makine_id, kisi_id, fason_firma_id, istasyon_id,
       ayar_suresi_dk, birim_sure_dk, termin_gun, bagimlilik, devir_adedi, fire_payi_yuzde, makine_kullanimi, en_kucuk_parca, yeniden_ayar,
       talimat_surumu, fason_firmasiz, tur, ek_aciklama, dugum, dugum_malzeme_id, kaynak_op_no, birim_carpani)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::numeric) RETURNING id`,
    [emirId, ...IS_EMRI_DEGERLERI(y), y.tur ?? 'rota', y.ekAciklama ?? null,
      y.dugum?.ad ?? null, y.dugum?.malzemeNo ?? null, y.dugum?.kaynakOpNo ?? null, y.dugum?.birimCarpani ?? null],
  );
  if (satir === null) throw new Error('İş emri eklenemedi.');
  return satir.id;
}

// 1248 a: dal satırı silinince öncülleri de gider; iş emri eski kurala döner.
export async function onculleriSil(db: Db, isEmriId: number): Promise<void> {
  await db.sorgu('DELETE FROM uretim_emirleri_is_emri_dali WHERE is_emri_id = $1', [isEmriId]);
}

// 1248 a: iş emrinin dalı ve öncül listesi baştan yazılır; dal satırı iş emrini öncül listeli yapar (liste boşsa dal başıdır).
export async function onculleriYaz(
  db: Db, isEmriId: number, dal: string | null, onculler: readonly AdimOnculu[], adetCarpani: number | null,
): Promise<void> {
  await db.sorgu(
    `INSERT INTO uretim_emirleri_is_emri_dali (is_emri_id, dal, adet_carpani) VALUES ($1, $2, $3)
     ON CONFLICT (is_emri_id) DO UPDATE SET dal = EXCLUDED.dal, adet_carpani = EXCLUDED.adet_carpani`,
    [isEmriId, dal, dal === null ? null : adetCarpani],
  );
  await db.sorgu('DELETE FROM uretim_emirleri_is_emri_onculu WHERE is_emri_id = $1', [isEmriId]);
  for (const o of onculler) {
    await db.sorgu(
      'INSERT INTO uretim_emirleri_is_emri_onculu (is_emri_id, oncul_is_emri_id, tur, devir_adedi) VALUES ($1, $2, $3, $4)',
      [isEmriId, o.id, o.tur, o.devirAdedi],
    );
  }
}

export async function isaretliListeVar(db: Db, isEmriId: number): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM emir_adimi a JOIN emir_adimi_olayi o ON o.adim_id = a.id WHERE a.is_emri_id = $1) AS var`, [isEmriId],
  );
  return satir?.var === true;
}

// Yalnız bekleyen iş emri güncellenir; adayları ve bileşenleri yeniden yazılır (çağıran ekler). Rota adımı hâlâ firmasızken emirde
// seçilmiş firma silinmez (2874).
export async function bekleyenIsEmriniGuncelle(db: Db, id: number, y: IsEmriYazisi): Promise<void> {
  await db.sorgu(
    `UPDATE uretim_emirleri_is_emri SET sira = $2, op_no = $3, operasyon_tipi_id = $4, ad = $5, makine_id = $6, kisi_id = $7,
            fason_firma_id = CASE WHEN $20 AND fason_firma_id IS NOT NULL THEN fason_firma_id ELSE $8 END, istasyon_id = $9, ayar_suresi_dk = $10,
            birim_sure_dk = $11, termin_gun = $12, bagimlilik = $13, devir_adedi = $14, fire_payi_yuzde = $15, makine_kullanimi = $16,
            en_kucuk_parca = $17, yeniden_ayar = $18, talimat_surumu = $19, fason_firmasiz = $20 AND fason_firma_id IS NULL,
            surum = surum + 1
      WHERE id = $1 AND durum = 'bekliyor'`,
    [id, ...IS_EMRI_DEGERLERI(y)],
  );
  await db.sorgu('DELETE FROM uretim_emirleri_is_emri_adayi WHERE is_emri_id = $1', [id]);
  await db.sorgu('DELETE FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = $1', [id]);
  await db.sorgu('DELETE FROM emir_adimi WHERE is_emri_id = $1', [id]);
}

// Bekleyen iş emrinin işaretlenmemiş listesi onunla birlikte silinir; tetikleyici işaretliyi ve başlamışınkini reddeder.
export async function bekleyenIsEmriniSil(db: Db, id: number): Promise<void> {
  await db.sorgu('DELETE FROM emir_adimi WHERE is_emri_id = $1', [id]);
  await db.sorgu(`DELETE FROM uretim_emirleri_is_emri WHERE id = $1 AND durum = 'bekliyor'`, [id]);
}

export function isEmriEkAciklamasiYaz(db: Db, id: number, aciklama: string | null): Promise<unknown> {
  return db.sorgu(`UPDATE uretim_emirleri_is_emri SET ek_aciklama = $2 WHERE id = $1 AND durum = 'bekliyor'`, [id, aciklama]);
}

export function isEmriSirasiYaz(db: Db, id: number, sira: number): Promise<unknown> {
  return db.sorgu('UPDATE uretim_emirleri_is_emri SET sira = $2 WHERE id = $1', [id, sira]);
}

export function adayEkle(
  db: Db, isEmriId: number, a: { makineId: number | null; kisiId: number | null; ayarSuresiDk: string | null; birimSureDk: string | null },
): Promise<unknown> {
  return db.sorgu(
    'INSERT INTO uretim_emirleri_is_emri_adayi (is_emri_id, makine_id, kisi_id, ayar_suresi_dk, birim_sure_dk) VALUES ($1, $2, $3, $4, $5)',
    [isEmriId, a.makineId, a.kisiId, a.ayarSuresiDk, a.birimSureDk],
  );
}

export function bilesenEkle(db: Db, isEmriId: number, b: { malzemeNo: number; miktar: string; fireYuzde: string }): Promise<unknown> {
  return db.sorgu(
    'INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar, fire_yuzde) VALUES ($1, $2, $3, $4)',
    [isEmriId, b.malzemeNo, b.miktar, b.fireYuzde],
  );
}

export interface AdaySatiri {
  isEmriId: number;
  makineId: number | null;
  kisiId: number | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
}

export function adaylariGetir(db: Db, isEmriIdleri: readonly number[]): Promise<AdaySatiri[]> {
  return db.sorgu<AdaySatiri>(
    `SELECT is_emri_id AS "isEmriId", makine_id AS "makineId", kisi_id AS "kisiId", ayar_suresi_dk::text AS "ayarSuresiDk",
            birim_sure_dk::text AS "birimSureDk"
       FROM uretim_emirleri_is_emri_adayi WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, id`,
    [[...isEmriIdleri]],
  );
}

export function bilesenleriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<{ isEmriId: number; malzemeNo: number; miktar: string; fireYuzde: string }[]> {
  return db.sorgu(
    `SELECT is_emri_id AS "isEmriId", malzeme_no AS "malzemeNo", miktar::text AS miktar, fire_yuzde::text AS "fireYuzde"
       FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, malzeme_no`,
    [[...isEmriIdleri]],
  );
}

// Kaynak bir makine ya da kişidir (null: atanmamış); istasyon kaynaktan türer. Yalnız bekleyen ve fason olmayan iş emri. Süre verilirse
// (1713: kaynak bir adaydan geldi) ayar ve birim süresi de yazılır; verilmezse kalır.
export function isEmriKaynagiYaz(
  db: Db, id: number, k: { makineId: number | null; kisiId: number | null; istasyonId: number | null }, surum: number | null,
  sure: { ayarSuresiDk: string | null; birimSureDk: string | null } | null = null,
): Promise<{ id: number } | null> {
  return db.tek(
    `UPDATE uretim_emirleri_is_emri SET makine_id = $2, kisi_id = $3, istasyon_id = $4, surum = surum + 1,
            ayar_suresi_dk = CASE WHEN $6::boolean THEN $7::numeric ELSE ayar_suresi_dk END,
            birim_sure_dk = CASE WHEN $6::boolean THEN $8::numeric ELSE birim_sure_dk END
      WHERE id = $1 AND durum = 'bekliyor' AND fason_firma_id IS NULL AND NOT fason_firmasiz AND ($5::int IS NULL OR surum = $5) RETURNING id`,
    [id, k.makineId, k.kisiId, k.istasyonId, surum, sure !== null, sure?.ayarSuresiDk ?? null, sure?.birimSureDk ?? null],
  );
}

export function adaySil(db: Db, isEmriId: number, k: { makineId: number | null; kisiId: number | null }): Promise<unknown> {
  return db.sorgu(
    'DELETE FROM uretim_emirleri_is_emri_adayi WHERE is_emri_id = $1 AND (makine_id = $2 OR kisi_id = $3)',
    [isEmriId, k.makineId, k.kisiId],
  );
}

// Üretim yeri değişimi: kaynak, istasyon, süreler ve termin birlikte yazılır (fason süresiz ve istasyonsuzdur). Yalnız bekleyen ve fasona
// gönderimi olmayan iş emri; sürüm ekranın okuduğudur.
export interface UretimYeriYazisi {
  makineId: number | null; kisiId: number | null; fasonFirmaId: number | null; istasyonId: number | null;
  ayarSuresiDk: string | null; birimSureDk: string | null; terminGun: number | null;
}

export function uretimYeriYaz(db: Db, id: number, y: UretimYeriYazisi): Promise<{ id: number } | null> {
  return db.tek(
    `UPDATE uretim_emirleri_is_emri i SET makine_id = $2, kisi_id = $3, fason_firma_id = $4, istasyon_id = $5, ayar_suresi_dk = $6,
            birim_sure_dk = $7, termin_gun = $8, fason_firmasiz = false, surum = surum + 1
      WHERE i.id = $1 AND i.durum = 'bekliyor' AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_fason_hareketi f WHERE f.is_emri_id = i.id)
      RETURNING i.id`,
    [id, y.makineId, y.kisiId, y.fasonFirmaId, y.istasyonId, y.ayarSuresiDk, y.birimSureDk, y.terminGun],
  );
}

export interface UretimYeriDegisimiSatiri {
  id: number; isEmriId: number;
  eskiMakineId: number | null; eskiKisiId: number | null; eskiFasonFirmaId: number | null; eskiIstasyonId: number | null;
  eskiAyarSuresiDk: string | null; eskiBirimSureDk: string | null; eskiTerminGun: number | null;
  yeniFasonFirmaId: number | null; yeniTerminGun: number | null; kisiId: number; zaman: string;
  eskiFasonFirmasiz: boolean;
}

const URETIM_YERI = `d.id, d.is_emri_id AS "isEmriId", d.eski_makine_id AS "eskiMakineId", d.eski_kisi_id AS "eskiKisiId",
  d.eski_fason_firma_id AS "eskiFasonFirmaId", d.eski_istasyon_id AS "eskiIstasyonId", d.eski_ayar_suresi_dk::text AS "eskiAyarSuresiDk",
  d.eski_birim_sure_dk::text AS "eskiBirimSureDk", d.eski_termin_gun AS "eskiTerminGun", d.yeni_fason_firma_id AS "yeniFasonFirmaId",
  d.yeni_termin_gun AS "yeniTerminGun", d.kisi_id AS "kisiId", ${ISO('d.zaman')} AS zaman, d.eski_fason_firmasiz AS "eskiFasonFirmasiz"`;

// İş emri başına değişimler, eskiden yeniye.
export function uretimYeriDegisimleriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<UretimYeriDegisimiSatiri[]> {
  return db.sorgu<UretimYeriDegisimiSatiri>(
    `SELECT ${URETIM_YERI} FROM uretim_emirleri_uretim_yeri_degisimi d WHERE d.is_emri_id = ANY($1::int[]) ORDER BY d.is_emri_id, d.id`,
    [[...isEmriIdleri]],
  );
}

export async function uretimYeriDegisimiEkle(
  db: Db, isEmriId: number, eski: UretimYeriYazisi, yeni: { fasonFirmaId: number | null; terminGun: number | null }, kisiId: number, an: string,
  eskiFirmasiz = false,
): Promise<void> {
  await db.sorgu(
    `INSERT INTO uretim_emirleri_uretim_yeri_degisimi (is_emri_id, eski_makine_id, eski_kisi_id, eski_fason_firma_id, eski_istasyon_id,
       eski_ayar_suresi_dk, eski_birim_sure_dk, eski_termin_gun, yeni_fason_firma_id, yeni_termin_gun, kisi_id, zaman, eski_fason_firmasiz)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13)`,
    [isEmriId, eski.makineId, eski.kisiId, eski.fasonFirmaId, eski.istasyonId, eski.ayarSuresiDk, eski.birimSureDk, eski.terminGun,
      yeni.fasonFirmaId, yeni.terminGun, kisiId, an, eskiFirmasiz],
  );
}

// 1890 a: yalnız istasyonu boş, kişiye atanmış bekleyen adım; makineli ya da fason adıma yazılmaz.
export function kisiAdimiIstasyonunuYaz(db: Db, id: number, istasyonId: number): Promise<{ id: number } | null> {
  return db.tek(
    `UPDATE uretim_emirleri_is_emri SET istasyon_id = $2, surum = surum + 1
      WHERE id = $1 AND durum = 'bekliyor' AND istasyon_id IS NULL AND kisi_id IS NOT NULL AND makine_id IS NULL AND fason_firma_id IS NULL AND NOT fason_firmasiz
      RETURNING id`,
    [id, istasyonId],
  );
}

export function isEmriBaslat(db: Db, id: number, an: string): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = $2::timestamptz, surum = surum + 1 WHERE id = $1 AND durum = 'bekliyor'`,
    [id, an],
  );
}

export function isEmriBitir(db: Db, id: number, saglamAdet: number, an: string): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_is_emri SET durum = 'tamam', bitis = $3::timestamptz, saglam_adet = $2, surum = surum + 1
      WHERE id = $1 AND durum = 'calisiyor'`,
    [id, saglamAdet, an],
  );
}

export interface FasonHareketiSatiri {
  id: number;
  isEmriId: number;
  yon: 'gidis' | 'donus';
  adet: number;
  hurdaAdet: number | null;
  kisiId: number;
  zaman: string;
}

const FASON = `f.id, f.is_emri_id AS "isEmriId", f.yon, f.adet, f.hurda_adet AS "hurdaAdet", f.kisi_id AS "kisiId", ${ISO('f.zaman')} AS zaman`;

export function fasonHareketleriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<FasonHareketiSatiri[]> {
  return db.sorgu<FasonHareketiSatiri>(
    `SELECT ${FASON} FROM uretim_emirleri_fason_hareketi f WHERE f.is_emri_id = ANY($1::int[]) ORDER BY f.is_emri_id, f.id`,
    [[...isEmriIdleri]],
  );
}

// Satın almanın dış operasyon listesi: bitmemiş fason iş emirleri ve hareket toplamları. Gün dönüşümü bağlantının saat dilimiyle
// (tesis, İstanbul) yapılır. Toplam yalnız o yönde hareket varsa doludur. Plan tarihi emirde tutulmaz; satın alma canlı plandan alır.
// Dönüşler gün sırasıyla (gün, adet, hurda): satın almanın adet ağırlıklı gecikmesi için.
export function fasonIsEmirleri(db: Db): Promise<FasonIsEmri[]> {
  return db.sorgu<FasonIsEmri>(
    `SELECT i.id AS "isEmriId", e.id AS "uretimEmriId", e.emir_no AS "emirNo", e.parca_ad AS urun, i.op_no AS "opNo", i.ad AS adim, i.fason_firma_id AS "firmaId",
       e.adet, e.malzeme_no AS "malzemeNo", i.termin_gun AS "terminGun", to_char(e.teslim, 'YYYY-MM-DD') AS teslim,
       ${NULLU_ISO('h.ilk_gidis')} AS "ilkGidis",
       CASE WHEN h.ilk_gidis IS NULL OR i.termin_gun IS NULL THEN NULL ELSE to_char(h.ilk_gidis::date + i.termin_gun, 'YYYY-MM-DD') END AS termin,
       ${NULLU_ISO('h.ilk_donus')} AS "ilkDonus", ${NULLU_ISO('h.son_donus')} AS "sonDonus", h.gonderilen, h.donen, h.hurda,
       (SELECT COALESCE(json_agg(json_build_object('gun', to_char(f.zaman::date, 'YYYY-MM-DD'), 'adet', f.adet, 'hurda', COALESCE(f.hurda_adet, 0)) ORDER BY f.zaman), '[]'::json)
          FROM uretim_emirleri_fason_hareketi f WHERE f.is_emri_id = i.id AND f.yon = 'donus') AS donusler
     FROM uretim_emirleri_is_emri i
     JOIN uretim_emri e ON e.id = i.uretim_emri_id
     LEFT JOIN LATERAL (
       SELECT min(f.zaman) FILTER (WHERE f.yon = 'gidis') AS ilk_gidis, min(f.zaman) FILTER (WHERE f.yon = 'donus') AS ilk_donus,
         max(f.zaman) FILTER (WHERE f.yon = 'donus') AS son_donus, (sum(f.adet) FILTER (WHERE f.yon = 'gidis'))::int AS gonderilen,
         (sum(f.adet) FILTER (WHERE f.yon = 'donus'))::int AS donen, (sum(f.hurda_adet) FILTER (WHERE f.yon = 'donus'))::int AS hurda
       FROM uretim_emirleri_fason_hareketi f WHERE f.is_emri_id = i.id
     ) h ON true
     WHERE (i.fason_firma_id IS NOT NULL OR i.fason_firmasiz) AND i.durum <> 'tamam' AND e.durum NOT IN ('iptal', 'bitti') AND NOT e.arsiv
     ORDER BY e.id, i.sira`,
  );
}

export interface FasonIsEmri {
  isEmriId: number;
  // Fason gidiş, dönüş ve tamamlama uçları emir kimliğiyle çağrılır (/adimli-emirler/:id/is-emirleri/:isEmriId/...).
  uretimEmriId: number;
  emirNo: string;
  urun: string | null;
  opNo: number;
  adim: string | null;
  firmaId: number | null;
  // Satın almanın fason ön talebi (898 a): emrin adedi, parçanın kartı, adımın fason günü ve emrin teslim günü.
  adet: number;
  malzemeNo: number | null;
  terminGun: number | null;
  teslim: string | null;
  ilkGidis: string | null;
  termin: string | null;
  ilkDonus: string | null;
  sonDonus: string | null;
  gonderilen: number | null;
  donen: number | null;
  hurda: number | null;
  donusler: { gun: string; adet: number; hurda: number }[];
}

export function fasonHareketiBul(db: Db, id: number): Promise<FasonHareketiSatiri | null> {
  return db.tek<FasonHareketiSatiri>(`SELECT ${FASON} FROM uretim_emirleri_fason_hareketi f WHERE f.id = $1`, [id]);
}

export async function fasonHareketiEkle(
  db: Db, g: { isEmriId: number; yon: 'gidis' | 'donus'; adet: number; hurdaAdet: number | null; kisiId: number; an: string },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emirleri_fason_hareketi (is_emri_id, yon, adet, hurda_adet, kisi_id, zaman) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
     RETURNING id`,
    [g.isEmriId, g.yon, g.adet, g.hurdaAdet, g.kisiId, g.an],
  );
  if (satir === null) throw new Error('Fason hareketi eklenemedi.');
  return satir.id;
}
