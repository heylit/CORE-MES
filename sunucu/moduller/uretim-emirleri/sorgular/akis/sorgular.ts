import type { Db } from '#cekirdek/db.ts';
import type { EmirDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimOnculu } from '../../kurallar.ts';
import { DAL_VE_ONCUL, ISO, NULLU_ISO, TARIH } from '../ortak/sorgular.ts';
import type { OlaySatiri } from '../emir/sorgular.ts';

// Akış süresi (kart #1338): emrin bütün zaman damgaları, yalnız okuma. Olaylar iki defterden (başlat/bitir ve duruş/ayar) zaman sırasıyla birleşir.
export interface AkisEmirSatiri {
  id: number; emirNo: string; malzemeNo: number | null; adet: number; durum: EmirDurumu;
  acilma: string; baslama: string | null; bitis: string | null; teslim: string | null;
}
export interface AkisIsEmriSatiri {
  id: number; opNo: number; sira: number; istasyonId: number | null; fasonFirmaId: number | null; terminGun: number | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam'; baslama: string | null; bitis: string | null; birimSureDk: string | null; ayarSuresiDk: string | null;
  // Akış, adım önündeki beklemeyi bağımlılığa göre ölçer: akışlıda girdi devir adedi kadar sağlam çıkınca hazırdır.
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz'; devirAdedi: number | null;
}
export interface AkisOlaySatiri {
  isEmriId: number | null; zaman: string; olay: 'baslat' | 'bitir' | 'duraklat' | 'durdur' | 'devam' | 'ayar';
  durusNedeniId: number | null; istasyonId: number | null; kisiId: number;
}
// Refakat kartıyla sayılmışsa kartı (kart #708: Akış Süresi kartın akışını kartla sayılanlardan ölçer); kartsız sayımda null.
export interface AkisSayimSatiri {
  isEmriId: number | null; zaman: string; tur: 'saglam' | 'hurda'; adet: number; duzeltme: boolean; refakatPartisiId: number | null; kisiId: number; hurdaNedeniId: number | null;
}
export interface AkisFasonSatiri { isEmriId: number; yon: 'gidis' | 'donus'; zaman: string; adet: number; hurdaAdet: number | null }

export function akisEmriGetir(db: Db, emirId: number): Promise<AkisEmirSatiri | null> {
  return db.tek<AkisEmirSatiri>(
    `SELECT e.id, e.emir_no AS "emirNo", e.malzeme_no AS "malzemeNo", e.adet, e.durum, ${ISO('e.acilma')} AS acilma,
            ${NULLU_ISO('e.baslama')} AS baslama, ${NULLU_ISO('e.bitis')} AS bitis, ${TARIH('e.teslim')} AS teslim
       FROM uretim_emri e WHERE e.id = $1`,
    [emirId],
  );
}

export function akisIsEmirleriGetir(db: Db, emirId: number): Promise<AkisIsEmriSatiri[]> {
  return db.sorgu<AkisIsEmriSatiri>(
    `SELECT i.id, i.op_no AS "opNo", i.sira, i.istasyon_id AS "istasyonId", i.fason_firma_id AS "fasonFirmaId", i.termin_gun AS "terminGun",
            i.durum, ${NULLU_ISO('i.baslama')} AS baslama, ${NULLU_ISO('i.bitis')} AS bitis,
            i.birim_sure_dk::text AS "birimSureDk", i.ayar_suresi_dk::text AS "ayarSuresiDk", i.bagimlilik, i.devir_adedi AS "devirAdedi"
       FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = $1 ORDER BY i.sira`,
    [emirId],
  );
}

export function akisOlaylariGetir(db: Db, emirId: number): Promise<AkisOlaySatiri[]> {
  return db.sorgu<AkisOlaySatiri>(
    `SELECT "isEmriId", ${ISO('zaman')} AS zaman, olay, "durusNedeniId", "istasyonId", "kisiId" FROM (
       SELECT k.is_emri_id AS "isEmriId", k.zaman, k.olay, NULL::int AS "durusNedeniId", k.istasyon_id AS "istasyonId", k.kisi_id AS "kisiId", 0 AS defter, k.id
         FROM uretim_kaydi k WHERE k.emir_id = $1
       UNION ALL
       SELECT o.is_emri_id, o.zaman, o.olay, o.durus_nedeni_id, o.istasyon_id, o.kisi_id, 1, o.id FROM uretim_olayi o WHERE o.emir_id = $1
     ) t ORDER BY t.zaman, t.defter, t.id`,
    [emirId],
  );
}

export function akisSayimlariGetir(db: Db, emirId: number): Promise<AkisSayimSatiri[]> {
  return db.sorgu<AkisSayimSatiri>(
    `SELECT s.is_emri_id AS "isEmriId", ${ISO('s.zaman')} AS zaman, s.tur, s.adet, s.duzeltme, s.refakat_partisi_id AS "refakatPartisiId",
            s.kisi_id AS "kisiId", s.hurda_nedeni_id AS "hurdaNedeniId"
       FROM uretim_sayimi s WHERE s.emir_id = $1 AND s.tur IN ('saglam', 'hurda') ORDER BY s.zaman, s.id`,
    [emirId],
  );
}

export function akisFasonGetir(db: Db, emirId: number): Promise<AkisFasonSatiri[]> {
  return db.sorgu<AkisFasonSatiri>(
    `SELECT h.is_emri_id AS "isEmriId", h.yon, ${ISO('h.zaman')} AS zaman, h.adet, h.hurda_adet AS "hurdaAdet"
       FROM uretim_emirleri_fason_hareketi h JOIN uretim_emirleri_is_emri i ON i.id = h.is_emri_id
      WHERE i.uretim_emri_id = $1 ORDER BY h.zaman, h.id`,
    [emirId],
  );
}

// Sayımın stok yansıması (terminal üretim girişi): adımın yeri (önceki adımlar sırayla ve son adım), girdileri ve emrin taşıdığı malzeme. Taşınan malzeme
// statü kuralıyla aynıdır: ilk adımın ilk girdisi (bileşen kayıt sırası); alt partide kök emrin ilk adımı.
// 1348 a: dal satırı olan adımda öncüller op numarasıyla, sırayla (boş: dal başı); satırı olmayan (1248 öncesi) adımda null.
export interface AdimUretimSatiri { uretimEmriId: number; opNo: number; oncekiOpNolari: number[]; onculOpNolari: number[] | null; sonAdim: boolean }
const ONCUL_OP_NOLARI = (is: string) => `(SELECT ARRAY(SELECT p.op_no FROM uretim_emirleri_is_emri_onculu o JOIN uretim_emirleri_is_emri p ON p.id = o.oncul_is_emri_id
                    WHERE o.is_emri_id = d.is_emri_id AND p.sira < ${is}.sira ORDER BY p.sira)
     FROM uretim_emirleri_is_emri_dali d WHERE d.is_emri_id = ${is}.id)`;
export function adimUretimSatiriGetir(db: Db, isEmriId: number): Promise<AdimUretimSatiri | null> {
  return db.tek<AdimUretimSatiri>(
    `SELECT i.uretim_emri_id AS "uretimEmriId", i.op_no AS "opNo",
            ARRAY(SELECT o.op_no FROM uretim_emirleri_is_emri o WHERE o.uretim_emri_id = i.uretim_emri_id AND o.sira < i.sira ORDER BY o.sira) AS "oncekiOpNolari",
            ${ONCUL_OP_NOLARI('i')} AS "onculOpNolari",
            NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri s WHERE s.uretim_emri_id = i.uretim_emri_id AND s.sira > i.sira) AS "sonAdim"
       FROM uretim_emirleri_is_emri i WHERE i.id = $1`,
    [isEmriId],
  );
}
// Emrin bütün adımları sırayla: öncülleri (adimUretimSatiriGetir ile aynı kural) ve girdileri (bileşen kayıt sırası).
// dal: dal satırındaki etiket (boş: ana hat ya da 1248 öncesi emir).
// adetCarpani: 1257 a dal adımının "1 mamul için adet"i (boş: 1).
export interface EmirAdimZinciriSatiri {
  opNo: number; dal: string | null; adetCarpani: number | null; onculOpNolari: number[] | null; girdiler: { malzemeNo: number; miktar: string }[];
}
export function emirAdimZinciriGetir(db: Db, uretimEmriId: number): Promise<EmirAdimZinciriSatiri[]> {
  return db.sorgu<EmirAdimZinciriSatiri>(
    `SELECT i.op_no AS "opNo", (SELECT d.dal FROM uretim_emirleri_is_emri_dali d WHERE d.is_emri_id = i.id) AS dal,
            (SELECT d.adet_carpani FROM uretim_emirleri_is_emri_dali d WHERE d.is_emri_id = i.id) AS "adetCarpani", ${ONCUL_OP_NOLARI('i')} AS "onculOpNolari",
            COALESCE((SELECT json_agg(json_build_object('malzemeNo', b.malzeme_no, 'miktar', b.miktar::text) ORDER BY b.id)
                        FROM uretim_emirleri_is_emri_bileseni b WHERE b.is_emri_id = i.id), '[]'::json) AS girdiler
       FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = $1 ORDER BY i.sira`,
    [uretimEmriId],
  );
}
export function adimGirdileriGetir(db: Db, isEmriId: number): Promise<{ malzemeNo: number; miktar: string }[]> {
  return db.sorgu(
    'SELECT malzeme_no AS "malzemeNo", miktar::text AS miktar FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = $1 ORDER BY id', [isEmriId],
  );
}
export function tasinanGirdiGetir(db: Db, uretimEmriId: number): Promise<{ malzemeNo: number; miktar: string } | null> {
  return db.tek(
    `WITH RECURSIVE kok AS (
       SELECT id, ust_emir_id FROM uretim_emri WHERE id = $1
       UNION ALL SELECT e.id, e.ust_emir_id FROM uretim_emri e JOIN kok ON e.id = kok.ust_emir_id
     )
     SELECT b.malzeme_no AS "malzemeNo", b.miktar::text AS miktar
       FROM kok JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = kok.id JOIN uretim_emirleri_is_emri_bileseni b ON b.is_emri_id = i.id
      WHERE kok.ust_emir_id IS NULL
      ORDER BY i.sira, b.id LIMIT 1`,
    [uretimEmriId],
  );
}

export interface BitenIsEmriSatiri {
  isEmriId: number;
  uretimEmriId: number;
  istasyonId: number | null;
  saglamAdet: number | null;
  bitis: string;
}

// Pencerede [baslangic, bitis) biten iş emirleri, bitiş sırasıyla; istasyon listesi verilirse yalnız onlardaki.
export function bitenIsEmirleriGetir(db: Db, baslangic: string, bitis: string, istasyonIdleri: readonly number[] | null): Promise<BitenIsEmriSatiri[]> {
  return db.sorgu(
    `SELECT i.id AS "isEmriId", i.uretim_emri_id AS "uretimEmriId", i.istasyon_id AS "istasyonId", i.saglam_adet AS "saglamAdet",
            ${ISO('i.bitis')} AS bitis
       FROM uretim_emirleri_is_emri i
      WHERE i.durum = 'tamam' AND i.bitis >= $1::timestamptz AND i.bitis < $2::timestamptz
        AND ($3::int[] IS NULL OR i.istasyon_id = ANY($3::int[]))
      ORDER BY i.bitis, i.id`,
    [baslangic, bitis, istasyonIdleri === null ? null : [...istasyonIdleri]],
  );
}

export interface FasonGecmisSatiri {
  isEmriId: number;
  malzemeNo: number | null;
  operasyonTipiId: number;
  firmaId: number;
  adet: number;
  ilkGidis: string;
  sonDonus: string;
  terminGun: number | null;
}

// Satın almanın fason süresi tahmini (CA-2): en az bir gidişi ve dönüşü olan fason iş emirleri; bitmiş ve arşivdeki dahil, iptal emir hariç.
export function fasonGecmisiGetir(db: Db, secim: { firmaId: number | null; malzemeNo: number | null; sonGun: number | null }): Promise<FasonGecmisSatiri[]> {
  return db.sorgu<FasonGecmisSatiri>(
    `SELECT i.id AS "isEmriId", e.malzeme_no AS "malzemeNo", i.operasyon_tipi_id AS "operasyonTipiId", i.fason_firma_id AS "firmaId",
       h.gonderilen AS adet, ${ISO('h.ilk_gidis')} AS "ilkGidis", ${ISO('h.son_donus')} AS "sonDonus", i.termin_gun AS "terminGun"
     FROM uretim_emirleri_is_emri i
     JOIN uretim_emri e ON e.id = i.uretim_emri_id
     JOIN LATERAL (
       SELECT min(f.zaman) FILTER (WHERE f.yon = 'gidis') AS ilk_gidis, max(f.zaman) FILTER (WHERE f.yon = 'donus') AS son_donus,
         (sum(f.adet) FILTER (WHERE f.yon = 'gidis'))::int AS gonderilen
       FROM uretim_emirleri_fason_hareketi f WHERE f.is_emri_id = i.id
     ) h ON h.ilk_gidis IS NOT NULL AND h.son_donus IS NOT NULL
     WHERE i.fason_firma_id IS NOT NULL AND e.durum <> 'iptal'
       AND ($1::int IS NULL OR i.fason_firma_id = $1) AND ($2::int IS NULL OR e.malzeme_no = $2)
       AND ($3::int IS NULL OR h.ilk_gidis >= now() - make_interval(days => $3))
     ORDER BY i.id`,
    [secim.firmaId, secim.malzemeNo, secim.sonGun],
  );
}

// Proje maliyeti (197 a): projenin emirlerinin iş emirleri, iptal edilmiş emir hariç (arşivdeki dahil: maliyeti projede kalır).
export interface ProjeIsEmriSatiri {
  isEmriId: number; uretimEmriId: number; emirNo: string; opNo: number; istasyonId: number | null;
  makineId: number | null; kisiId: number | null; fasonFirmaId: number | null; adet: number; saglam: number | null;
  birimSureDk: string | null; ayarSureDk: string | null; durum: 'bekliyor' | 'calisiyor' | 'tamam'; emirDurumu: EmirDurumu; bitis: string | null;
  siparisSatiriId: number | null;
}
export function projeninIsEmirleriGetir(db: Db, projeId: number): Promise<ProjeIsEmriSatiri[]> {
  return db.sorgu(
    `SELECT i.id AS "isEmriId", e.id AS "uretimEmriId", e.emir_no AS "emirNo", i.op_no AS "opNo", i.istasyon_id AS "istasyonId",
            i.makine_id AS "makineId", i.kisi_id AS "kisiId", i.fason_firma_id AS "fasonFirmaId", e.adet, i.saglam_adet AS saglam,
            i.birim_sure_dk::text AS "birimSureDk", i.ayar_suresi_dk::text AS "ayarSureDk", i.durum, e.durum AS "emirDurumu", ${NULLU_ISO('i.bitis')} AS bitis,
            e.siparis_satiri_id AS "siparisSatiriId"
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
      WHERE e.proje_id = $1 AND e.durum <> 'iptal'
      ORDER BY e.id, i.sira`,
    [projeId],
  );
}

// Gerçekleşen süreler (saniye): işleme makine kullanımından, ayar iş emrinin son ayar olayından ilk kullanımına (kullanım yoksa şimdiye;
// ayar olayı yoksa null, sıfır uydurulmaz), katılım kişi başına; açık aralık şimdiye kadar sayılır.
export function isEmriSureleriGetir(db: Db, idler: readonly number[]): Promise<{ isEmriId: number; islemeSn: number; ayarSn: number | null; katilim: { kisiId: number; saniye: number }[] }[]> {
  return db.sorgu(
    `WITH ie AS (SELECT unnest($1::int[]) AS id),
          ku AS (SELECT k.is_emri_id AS id, sum(extract(epoch FROM COALESCE(k.bitis, clock_timestamp()) - k.baslama)) AS sn, min(k.baslama) AS ilk
                   FROM uretim_emirleri_makine_kullanimi k WHERE k.is_emri_id = ANY($1::int[]) GROUP BY k.is_emri_id),
          ay AS (SELECT o.is_emri_id AS id, max(o.zaman) AS bas FROM uretim_olayi o LEFT JOIN ku ON ku.id = o.is_emri_id
                  WHERE o.is_emri_id = ANY($1::int[]) AND o.olay = 'ayar' AND o.zaman <= COALESCE(ku.ilk, clock_timestamp()) GROUP BY o.is_emri_id),
          ka AS (SELECT is_emri_id AS id, kisi_id, sum(extract(epoch FROM COALESCE(cikis, clock_timestamp()) - giris)) AS sn
                   FROM uretim_emirleri_katilim WHERE is_emri_id = ANY($1::int[]) GROUP BY is_emri_id, kisi_id)
     SELECT ie.id AS "isEmriId", round(COALESCE(ku.sn, 0))::int AS "islemeSn",
            round(extract(epoch FROM COALESCE(ku.ilk, clock_timestamp()) - ay.bas))::int AS "ayarSn",
            COALESCE((SELECT json_agg(json_build_object('kisiId', ka.kisi_id, 'saniye', round(ka.sn)::int) ORDER BY ka.kisi_id) FROM ka WHERE ka.id = ie.id), '[]') AS katilim
       FROM ie JOIN uretim_emirleri_is_emri i ON i.id = ie.id
       LEFT JOIN ku ON ku.id = ie.id LEFT JOIN ay ON ay.id = ie.id`,
    [[...new Set(idler)]],
  );
}


// Hazırlık muafiyeti (264 a): yalnız ekleme; aynı madde aynı yerde bir kez (benzersiz dizin).
export interface MuafiyetSatiri { madde: 'cnc' | 'ozel-proses'; isEmriId: number | null; kisiId: number; gerekce: string; zaman: string }
export function muafiyetler(db: Db, uretimEmriId: number): Promise<MuafiyetSatiri[]> {
  return db.sorgu<MuafiyetSatiri>(
    `SELECT madde, is_emri_id AS "isEmriId", kisi_id AS "kisiId", gerekce, ${ISO('zaman')} AS zaman FROM uretim_emirleri_hazirlik_muafiyeti
      WHERE uretim_emri_id = $1 ORDER BY id`, [uretimEmriId],
  );
}
export function muafiyetEkle(db: Db, m: { uretimEmriId: number; isEmriId: number | null; madde: string; kisiId: number; gerekce: string }): Promise<unknown> {
  return db.sorgu(
    'INSERT INTO uretim_emirleri_hazirlik_muafiyeti (uretim_emri_id, is_emri_id, madde, kisi_id, gerekce) VALUES ($1, $2, $3, $4, $5)',
    [m.uretimEmriId, m.isEmriId, m.madde, m.kisiId, m.gerekce],
  );
}

// Kart başına adım sayımı (Soru 136 a): toplam, adımın tükettiği bütün parça (sağlam, karar bekleyen, red, hurda); sağlam, sonraki adıma geçen.
export function kartSayimlariGetir(db: Db, emirId: number, kartIdleri: readonly number[]): Promise<{ isEmriId: number; kartId: number; saglam: number; toplam: number }[]> {
  return db.sorgu(
    `SELECT is_emri_id AS "isEmriId", refakat_partisi_id AS "kartId",
            coalesce(sum(adet) FILTER (WHERE tur = 'saglam'), 0)::int AS saglam, sum(adet)::int AS toplam
       FROM uretim_sayimi WHERE emir_id = $1 AND refakat_partisi_id = ANY($2::int[]) AND is_emri_id IS NOT NULL
      GROUP BY is_emri_id, refakat_partisi_id`,
    [emirId, [...kartIdleri]],
  );
}

/* ---------------- paralel adım (kart 639) ---------------- */

// hatali: adımda girilmiş bütün hatalı parça kaydı; hataliEmirde: bunlardan kol açmadan emrin kendisinde kalanı (1188). Kola ayrılan adet
// adıma girenden düşer (adimaGiren), tüketime yalnız emirde kalan girer.
export interface AdimSayaci { isEmriId: number; saglam: number; hurda: number; kararBekliyor: number; red: number; hatali: number; hataliEmirde: number }

// 1188: hatalı kaydının adım başına toplamı; adimSayaclariGetir ve adimDurumlariGetir aynı tanımı kullanır.
const HATALI_TOPLAMI = `SELECT sum(adet) AS hatali, sum(adet) FILTER (WHERE hedef_emir_id = uretim_emri_id) AS emirde
  FROM uretim_emirleri_hatali_kaydi WHERE is_emri_id = i.id`;

// Adım başına net sayaç (düzeltme dahil); sayımı ve hatalı kaydı olmayan adım satır vermez.
export function adimSayaclariGetir(db: Db, isEmriIdleri: readonly number[]): Promise<AdimSayaci[]> {
  if (isEmriIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<AdimSayaci>(
    `SELECT i.id AS "isEmriId",
            COALESCE(s.saglam, 0)::int AS saglam, COALESCE(s.hurda, 0)::int AS hurda,
            COALESCE(s.kb, 0)::int AS "kararBekliyor", COALESCE(s.red, 0)::int AS red,
            COALESCE(h.hatali, 0)::int AS hatali, COALESCE(h.emirde, 0)::int AS "hataliEmirde"
       FROM unnest($1::int[]) AS i(id)
       LEFT JOIN LATERAL (
         SELECT count(*) AS n, sum(adet) FILTER (WHERE tur = 'saglam') AS saglam, sum(adet) FILTER (WHERE tur = 'hurda') AS hurda,
                sum(adet) FILTER (WHERE tur = 'karar_bekliyor') AS kb, sum(adet) FILTER (WHERE tur = 'red') AS red
           FROM uretim_sayimi WHERE is_emri_id = i.id) s ON true
       LEFT JOIN LATERAL (${HATALI_TOPLAMI}) h ON true
      WHERE s.n > 0 OR h.hatali IS NOT NULL`,
    [[...new Set(isEmriIdleri)]],
  );
}

// Adımın son olayı (ayar hariç): adımın çalışma hâli buradan türer. İş emirsiz eski emirde adım null'dır.
export function adimSonOlayi(db: Db, emirId: number, isEmriId: number | null): Promise<OlaySatiri | null> {
  return db.tek<OlaySatiri>(
    `SELECT emir_id AS "emirId", olay, durus_nedeni_id AS "durusNedeniId", ${ISO('zaman')} AS zaman
       FROM uretim_olayi WHERE emir_id = $1 AND is_emri_id IS NOT DISTINCT FROM $2::int AND olay <> 'ayar' ORDER BY id DESC LIMIT 1`,
    [emirId, isEmriId],
  );
}

// Emir başlamış kalırken istasyonu öncü adıma geçer (bir adım bitti, öteki sürüyor).
export function emirIstasyonunuYaz(db: Db, id: number, istasyonId: number): Promise<unknown> {
  return db.sorgu('UPDATE uretim_emri SET istasyon_id = $2, surum = surum + 1 WHERE id = $1', [id, istasyonId]);
}

export interface AdimDurumSatiri {
  id: number;
  emirId: number;
  sira: number;
  opNo: number;
  ad: string;
  istasyonId: number | null;
  makineId: number | null;
  fasonFirmaId: number | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
  saglamAdet: number | null;
  saglam: number;
  hurda: number;
  kararBekliyor: number;
  hatali: number;
  hataliEmirde: number;
  sonOlay: 'duraklat' | 'durdur' | 'devam' | null;
  // Bölünmüş ya da kol emir: adıma giren parti hesabı ister, listede eksik gösterilmez.
  partili: boolean;  onculler: AdimOnculu[] | null; adetCarpani: number | null;
}

// Emirlerin bütün adımları, sayaçları ve son olaylarıyla tek sorguda (liste okuması sorgu sayısını adım sayısıyla büyütmez).
export function adimDurumlariGetir(db: Db, emirIdleri: readonly number[]): Promise<AdimDurumSatiri[]> {
  if (emirIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<AdimDurumSatiri>(
    `SELECT i.id, i.uretim_emri_id AS "emirId", i.sira, i.op_no AS "opNo", i.ad, i.istasyon_id AS "istasyonId", i.makine_id AS "makineId",
            i.fason_firma_id AS "fasonFirmaId", i.durum, i.bagimlilik, i.devir_adedi AS "devirAdedi", i.saglam_adet AS "saglamAdet",
            COALESCE(s.saglam, 0)::int AS saglam, COALESCE(s.hurda, 0)::int AS hurda, COALESCE(s.kb, 0)::int AS "kararBekliyor",
            COALESCE(h.hatali, 0)::int AS hatali, COALESCE(h.emirde, 0)::int AS "hataliEmirde",
            (SELECT o.olay FROM uretim_olayi o WHERE o.is_emri_id = i.id AND o.olay <> 'ayar' ORDER BY o.id DESC LIMIT 1) AS "sonOlay",
            (e.ust_emir_id IS NOT NULL OR EXISTS (SELECT 1 FROM uretim_emri a WHERE a.ust_emir_id = e.id)) AS partili, ${DAL_VE_ONCUL}
       FROM uretim_emirleri_is_emri i
       JOIN uretim_emri e ON e.id = i.uretim_emri_id
       LEFT JOIN LATERAL (
         SELECT sum(adet) FILTER (WHERE tur = 'saglam') AS saglam, sum(adet) FILTER (WHERE tur = 'hurda') AS hurda,
                sum(adet) FILTER (WHERE tur = 'karar_bekliyor') AS kb
           FROM uretim_sayimi WHERE is_emri_id = i.id) s ON true
       LEFT JOIN LATERAL (${HATALI_TOPLAMI}) h ON true
      WHERE i.uretim_emri_id = ANY($1::int[])
      ORDER BY i.uretim_emri_id, i.sira`,
    [[...emirIdleri]],
  );
}

export interface AsimSatiri { sayimId: number; isEmriId: number; opNo: number; kisiId: number; adet: number; oncekiSaglam: number; zaman: string }

// 647 a: adımın sayımı önceki adımın o anki sağlamını aştığında yazılmıştır; aşan satır, bu adımın koşu toplamının o ana kadar öncülde
// sayılan sağlamı geçtiği satırdır. Bu adımda sağlam ve karar bekleyen, öncülde sağlam sayılır (sonraki adıma geçen). Kalite kararı satırı
// (karar bekleyenden sağlama geçiş) toplamı değiştirmediği için aşan satır sayılmaz. Bağımsız adımda, ilk adımda ve dal başında aşım yoktur.
// Öncül (B-3): dal satırı olan adımda öncül listesi (birden çok öncülde en az gelen, 1257 a çarpanıyla bu adımın birimine çevrilmiş,
// aşağı yuvarlanmış), olmayan eski adımda sırası bir küçük olan adım (kurallar.ts adetOnculleri ile aynı).
export function asimlarGetir(db: Db, emirId: number, isEmriId: number): Promise<AsimSatiri[]> {
  return db.sorgu<AsimSatiri>(
    `WITH adim AS (
       SELECT i.id, i.uretim_emri_id, i.sira, i.op_no, d.is_emri_id IS NOT NULL AS dalli, COALESCE(d.adet_carpani, 1) AS carpan
         FROM uretim_emirleri_is_emri i LEFT JOIN uretim_emirleri_is_emri_dali d ON d.is_emri_id = i.id
        WHERE i.id = $2 AND i.uretim_emri_id = $1 AND i.bagimlilik <> 'bagimsiz'),
     onceki AS (
       SELECT o.oncul_is_emri_id AS id, COALESCE(od.adet_carpani, 1) AS carpan
         FROM uretim_emirleri_is_emri_onculu o
         JOIN adim a ON o.is_emri_id = a.id AND a.dalli
         LEFT JOIN uretim_emirleri_is_emri_dali od ON od.is_emri_id = o.oncul_is_emri_id
       UNION ALL
       (SELECT i.id, 1 FROM uretim_emirleri_is_emri i JOIN adim a ON i.uretim_emri_id = a.uretim_emri_id AND i.sira < a.sira AND NOT a.dalli
         ORDER BY i.sira DESC LIMIT 1)),
     bu AS (
       SELECT s.id, s.zaman, s.kisi_id, s.adet, s.karar_veren_kisi_id, sum(s.adet) OVER (ORDER BY s.zaman, s.id) AS bu_toplam
         FROM uretim_sayimi s
        WHERE s.is_emri_id = (SELECT id FROM adim) AND s.tur IN ('saglam', 'karar_bekliyor')),
     kosu AS (
       SELECT b.*, (SELECT min(floor(COALESCE((SELECT sum(p.adet) FROM uretim_sayimi p
                                                  WHERE p.is_emri_id = o.id AND p.tur = 'saglam' AND (p.zaman, p.id) <= (b.zaman, b.id)), 0)
                                     * a.carpan::numeric / o.carpan))
                      FROM onceki o CROSS JOIN adim a) AS onceki_toplam
         FROM bu b)
     SELECT k.id AS "sayimId", a.id AS "isEmriId", a.op_no AS "opNo", k.kisi_id AS "kisiId",
            LEAST(k.adet, k.bu_toplam - k.onceki_toplam)::int AS adet, k.onceki_toplam::int AS "oncekiSaglam", ${ISO('k.zaman')} AS zaman
       FROM kosu k CROSS JOIN adim a
      WHERE k.adet > 0 AND k.karar_veren_kisi_id IS NULL AND k.bu_toplam > k.onceki_toplam AND EXISTS (SELECT 1 FROM onceki)
      ORDER BY k.zaman, k.id`,
    [emirId, isEmriId],
  );
}

// Takvim (891): planlı başlangıcı ya da teslimi [baslangic, bitis] içindeki emirler; taslak, iptal ve arşiv gelmez.
export interface TakvimEmirSatiri { id: number; emirNo: string; parcaAd: string; baslangic: string | null; teslim: string | null; durum: EmirDurumu; baslamis: boolean }
export function takvimEmirSatirlari(db: Db, baslangic: string, bitis: string): Promise<TakvimEmirSatiri[]> {
  return db.sorgu<TakvimEmirSatiri>(
    `SELECT e.id, e.emir_no AS "emirNo", e.parca_ad AS "parcaAd", ${TARIH('e.baslangic')} AS baslangic, ${TARIH('e.teslim')} AS teslim, e.durum,
            EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id AND i.durum <> 'bekliyor') AS baslamis
       FROM uretim_emri e
      WHERE NOT e.arsiv AND e.durum NOT IN ('taslak', 'iptal')
        AND (e.baslangic BETWEEN $1::date AND $2::date OR e.teslim BETWEEN $1::date AND $2::date)
      ORDER BY e.id`,
    [baslangic, bitis],
  );
}

// 1476-E: çok katmanlı emirde iş emrinin düğümü (1484 a). Rota adımına giden bağ düğümün malzemesi, rotadaki op numarası ve emrin patlatmasıdır;
// emir içindeki op_no yalnız emirde tekildir. Düğümsüz (tek katmanlı) iş emri haritada yoktur.
export interface IsEmriDugumu { isEmriId: number; dugum: string; dugumMalzemeNo: number; kaynakOpNo: number; patlatmaId: number | null }
export async function isEmriDugumleri(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, IsEmriDugumu>> {
  if (isEmriIdleri.length === 0) return new Map();
  const satirlar = await db.sorgu<IsEmriDugumu>(
    `SELECT i.id AS "isEmriId", i.dugum, i.dugum_malzeme_id AS "dugumMalzemeNo", i.kaynak_op_no AS "kaynakOpNo", e.patlatma_id AS "patlatmaId"
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
      WHERE i.id = ANY($1::int[]) AND i.dugum IS NOT NULL`,
    [[...new Set(isEmriIdleri)]],
  );
  return new Map(satirlar.map((s) => [s.isEmriId, s]));
}

// 1868: stok Teslim al'da istasyondaki her adımın üretim bilgisini okur; aşağıdakiler adimUretimSatiriGetir, adimGirdileriGetir,
// tasinanGirdiGetir ve emirAdimZinciriGetir'in toplu biçimidir (aynı kural ve sıra, tek sorgu).
export function adimUretimSatirlariGetir(db: Db, isEmriIdleri: readonly number[]): Promise<(AdimUretimSatiri & { isEmriId: number })[]> {
  return db.sorgu(
    `SELECT i.id AS "isEmriId", i.uretim_emri_id AS "uretimEmriId", i.op_no AS "opNo",
            ARRAY(SELECT o.op_no FROM uretim_emirleri_is_emri o WHERE o.uretim_emri_id = i.uretim_emri_id AND o.sira < i.sira ORDER BY o.sira) AS "oncekiOpNolari",
            ${ONCUL_OP_NOLARI('i')} AS "onculOpNolari",
            NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri s WHERE s.uretim_emri_id = i.uretim_emri_id AND s.sira > i.sira) AS "sonAdim"
       FROM uretim_emirleri_is_emri i WHERE i.id = ANY($1::int[]) ORDER BY i.id`,
    [[...new Set(isEmriIdleri)]],
  );
}
export function emirAdimZincirleriGetir(db: Db, emirIdleri: readonly number[]): Promise<(EmirAdimZinciriSatiri & { uretimEmriId: number })[]> {
  return db.sorgu(
    `SELECT i.uretim_emri_id AS "uretimEmriId", i.op_no AS "opNo", (SELECT d.dal FROM uretim_emirleri_is_emri_dali d WHERE d.is_emri_id = i.id) AS dal,
            (SELECT d.adet_carpani FROM uretim_emirleri_is_emri_dali d WHERE d.is_emri_id = i.id) AS "adetCarpani", ${ONCUL_OP_NOLARI('i')} AS "onculOpNolari",
            COALESCE((SELECT json_agg(json_build_object('malzemeNo', b.malzeme_no, 'miktar', b.miktar::text) ORDER BY b.id)
                        FROM uretim_emirleri_is_emri_bileseni b WHERE b.is_emri_id = i.id), '[]'::json) AS girdiler
       FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = ANY($1::int[]) ORDER BY i.uretim_emri_id, i.sira`,
    [[...new Set(emirIdleri)]],
  );
}
export function adimGirdileriTopluGetir(db: Db, isEmriIdleri: readonly number[]): Promise<{ isEmriId: number; malzemeNo: number; miktar: string }[]> {
  return db.sorgu(
    'SELECT is_emri_id AS "isEmriId", malzeme_no AS "malzemeNo", miktar::text AS miktar FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, id',
    [[...new Set(isEmriIdleri)]],
  );
}
export function tasinanGirdileriGetir(db: Db, emirIdleri: readonly number[]): Promise<{ uretimEmriId: number; malzemeNo: number; miktar: string }[]> {
  return db.sorgu(
    `SELECT e.id AS "uretimEmriId", t.* FROM unnest($1::int[]) AS e(id) CROSS JOIN LATERAL (
       WITH RECURSIVE kok AS (
         SELECT u.id, u.ust_emir_id FROM uretim_emri u WHERE u.id = e.id
         UNION ALL SELECT u.id, u.ust_emir_id FROM uretim_emri u JOIN kok ON u.id = kok.ust_emir_id
       )
       SELECT b.malzeme_no AS "malzemeNo", b.miktar::text AS miktar
         FROM kok JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = kok.id JOIN uretim_emirleri_is_emri_bileseni b ON b.is_emri_id = i.id
        WHERE kok.ust_emir_id IS NULL
        ORDER BY i.sira, b.id LIMIT 1) t`,
    [[...new Set(emirIdleri)]],
  );
}
