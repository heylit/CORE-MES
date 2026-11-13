import type { Db } from '#cekirdek/db.ts';
import type { SonOlayTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ISO, KARAR_SATIRI, TARIH } from '../ortak/sorgular.ts';

export type SayimKirilimi = 'istasyon' | 'kisi' | 'makine' | 'is_emri';
// Sayım satırında makine yoktur: sayım, zamanında emrin açık kullanımı olan makineye yazılır (bitişteki sayım dahil, bitirme
// sayımı yeri kapatmadan aynı anda yazılır). Açık kullanım yoksa (duraklatılmış ya da durdurulmuş iş) en son kapanan kullanıma
// yazılır (denetim #26: duraklatıp girilen adet makinesiz kalıyordu). Eşleşme iş emri üzerindendir: aynı emrin iki işlemi iki makinede
// aynı anda açıksa sayım yalnız kendi işleminin makinesine düşer; iki taraftan biri iş emirsizse (eski satır) eşleşme emir üzerinden
// kalır. Aynı işlem aynı anda n makinede sürüyorsa sayım tam sayı olarak eşit paylaştırılır, artan küçük kimlikli makineden başlayarak
// birer verilir: her sayımın makine payları toplamı girilen adede eşittir (#26).
const MAKINE_SAYIMI = `(SELECT p.id, p.emir_id, p.is_emri_id, p.kisi_id, p.istasyon_id, p.zaman, p.tur, p.makine_id,
         trunc(p.adet::numeric / p.n)::int
           + CASE WHEN p.r <= abs(p.adet - trunc(p.adet::numeric / p.n)::int * p.n) THEN sign(p.adet)::int ELSE 0 END AS adet
    FROM (SELECT s.id, s.emir_id, s.is_emri_id, s.kisi_id, s.istasyon_id, s.zaman, s.tur, s.adet, m.makine_id,
                 count(*) OVER (PARTITION BY s.id) AS n, row_number() OVER (PARTITION BY s.id ORDER BY m.makine_id) AS r
            FROM uretim_sayimi s
            JOIN LATERAL (
              SELECT DISTINCT a.makine_id FROM (
                SELECT k.makine_id, e.etkin, max(e.etkin) OVER () AS en
                  FROM uretim_emirleri_makine_kullanimi k
                  CROSS JOIN LATERAL (SELECT CASE WHEN k.bitis IS NULL OR k.bitis >= s.zaman THEN 'infinity'::timestamptz ELSE k.bitis END AS etkin) e
                 WHERE k.emir_id = s.emir_id AND (k.is_emri_id = s.is_emri_id OR k.is_emri_id IS NULL OR s.is_emri_id IS NULL)
                   AND k.makine_id IS NOT NULL AND k.baslama <= s.zaman) a
               WHERE a.etkin = a.en) m ON true) p) s`;

const KIRILIM: Record<SayimKirilimi, { kimlik: string; kaynak: string }> = {
  istasyon: { kimlik: 's.istasyon_id', kaynak: 'uretim_sayimi s' },
  kisi: { kimlik: 's.kisi_id', kaynak: 'uretim_sayimi s' },
  is_emri: { kimlik: 's.is_emri_id', kaynak: 'uretim_sayimi s' },
  makine: { kimlik: 's.makine_id', kaynak: MAKINE_SAYIMI },
};

// Yarı açık aralık [baslangic, bitis); düzeltme satırları dahil net toplam.
export function aralikAdetleriGetir(
  db: Db, kirilim: SayimKirilimi, idler: readonly number[], baslangic: string, bitis: string,
): Promise<{ id: number; saglam: number; hurda: number }[]> {
  const { kimlik, kaynak } = KIRILIM[kirilim];
  return db.sorgu(
    `SELECT ${kimlik} AS id,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'saglam'), 0)::int AS saglam,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'hurda'), 0)::int AS hurda
       FROM ${kaynak}
      WHERE ${kimlik} = ANY($1::int[]) AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz
      GROUP BY ${kimlik}`,
    [[...idler], baslangic, bitis],
  );
}

// Ardışık sınırlarla kurulan [sinirlar[g], sinirlar[g + 1]) aralıkları (gün kırılımı) tek sorguda; her aralık aralikAdetleriGetir ile aynıdır.
// Dış sınırlar dizinin aralık taramasıdır.
const ARALIKLAR = `SELECT (o - 1)::int AS gun, b AS bas, lead(b) OVER (ORDER BY o) AS bit FROM unnest($2::timestamptz[]) WITH ORDINALITY AS t(b, o)`;

export function gunlukAralikAdetleriGetir(
  db: Db, kirilim: SayimKirilimi, idler: readonly number[], sinirlar: readonly string[],
): Promise<{ gun: number; id: number; saglam: number; hurda: number }[]> {
  const { kimlik, kaynak } = KIRILIM[kirilim];
  return db.sorgu(
    `WITH g AS (${ARALIKLAR})
     SELECT g.gun, ${kimlik} AS id,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'saglam'), 0)::int AS saglam,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'hurda'), 0)::int AS hurda
       FROM ${kaynak} JOIN g ON s.zaman >= g.bas AND s.zaman < g.bit
      WHERE ${kimlik} = ANY($1::int[]) AND s.zaman >= ($2::timestamptz[])[1] AND s.zaman < ($2::timestamptz[])[cardinality($2::timestamptz[])]
      GROUP BY g.gun, ${kimlik}`,
    [[...idler], [...sinirlar]],
  );
}

// Aralıkların [baslangic, bitis) ile kesişen süresi, kimlik başına saniye. Açık aralık transaction anına kadar sayılır;
// pencereyle kesişmeyen kimlik sonuçta yoktur.
function kesisenSureler(
  db: Db, tablo: string, sutun: string, bas: string, son: string, idler: readonly number[], baslangic: string, bitis: string,
): Promise<{ id: number; saniye: number }[]> {
  return db.sorgu(
    `SELECT t.${sutun} AS id,
            floor(sum(extract(epoch FROM LEAST(COALESCE(t.${son}, now()), $3::timestamptz) - GREATEST(t.${bas}, $2::timestamptz))))::int AS saniye
       FROM ${tablo} t
      WHERE t.${sutun} = ANY($1::int[]) AND t.${bas} < $3::timestamptz AND COALESCE(t.${son}, now()) > $2::timestamptz
      GROUP BY t.${sutun}`,
    [[...idler], baslangic, bitis],
  );
}

export const katilimSureleriGetir = (db: Db, kisiIdleri: readonly number[], baslangic: string, bitis: string) =>
  kesisenSureler(db, 'uretim_emirleri_katilim', 'kisi_id', 'giris', 'cikis', kisiIdleri, baslangic, bitis);

export const makineSureleriGetir = (db: Db, makineIdleri: readonly number[], baslangic: string, bitis: string) =>
  kesisenSureler(db, 'uretim_emirleri_makine_kullanimi', 'makine_id', 'baslama', 'bitis', makineIdleri, baslangic, bitis);

// Makine kullanımlarının [baslangic, bitis) ile kesişen parçaları, makine ve başlama sırasıyla. Açık kullanım transaction anına kadardır.
export function makineKullanimAraliklariGetir(
  db: Db, makineIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<{ id: number; baslangic: string; bitis: string }[]> {
  return db.sorgu(
    `SELECT k.makine_id AS id, ${ISO('GREATEST(k.baslama, $2::timestamptz)')} AS baslangic,
            ${ISO('LEAST(COALESCE(k.bitis, now()), $3::timestamptz)')} AS bitis
       FROM uretim_emirleri_makine_kullanimi k
      WHERE k.makine_id = ANY($1::int[]) AND k.baslama < $3::timestamptz AND COALESCE(k.bitis, now()) > $2::timestamptz
      ORDER BY k.makine_id, k.baslama, k.id`,
    [[...makineIdleri], baslangic, bitis],
  );
}

export interface MakineSayimAniSatiri {
  id: number;
  zaman: string;
  saglam: number;
  hurda: number;
  red: number;
  standartSaniye: number;
  suresizSaglam: number;
}

// Makine kırılımlı sayım, makine ve an başına (aralikAdetleriGetir ve standartSureleriGetir ile aynı yere düşer); kalite reddi ayrı
// sütundur, karar bekleyen sayılmaz. Standart süre yuvarlanmaz: toplayan taraf toplamı yuvarlar.
export function makineSayimAnlariGetir(
  db: Db, makineIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<MakineSayimAniSatiri[]> {
  return db.sorgu<MakineSayimAniSatiri>(
    `SELECT s.makine_id AS id, ${ISO('s.zaman')} AS zaman,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'saglam'), 0)::int AS saglam,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'hurda'), 0)::int AS hurda,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'red'), 0)::int AS red,
            COALESCE(sum(s.adet * i.birim_sure_dk * 60) FILTER (WHERE s.tur = 'saglam' AND i.birim_sure_dk IS NOT NULL), 0)::float8 AS "standartSaniye",
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'saglam' AND i.birim_sure_dk IS NULL), 0)::int AS "suresizSaglam"
       FROM ${MAKINE_SAYIMI} LEFT JOIN uretim_emirleri_is_emri i ON i.id = s.is_emri_id
      WHERE s.makine_id = ANY($1::int[]) AND s.tur IN ('saglam', 'hurda', 'red') AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz
      GROUP BY s.makine_id, s.zaman
      ORDER BY s.makine_id, s.zaman`,
    [[...makineIdleri], baslangic, bitis],
  );
}

export function sonGirisleriGetir(db: Db, kirilim: SayimKirilimi, idler: readonly number[]): Promise<{ id: number; zaman: string }[]> {
  const { kimlik, kaynak } = KIRILIM[kirilim];
  return db.sorgu(
    `SELECT ${kimlik} AS id, ${ISO('max(s.zaman)')} AS zaman FROM ${kaynak} WHERE ${kimlik} = ANY($1::int[]) GROUP BY ${kimlik}`,
    [[...idler]],
  );
}

export interface CalisanIsEmriSatiri {
  emirId: number;
  id: number;
  opNo: number;
  ad: string;
  makineId: number | null;
}

// Emir başına en çok bir iş emri çalışır (tek çalışan kuralı); yine de sıraca ilki alınır.
export function calisanIsEmirleriGetir(db: Db, emirIdleri: readonly number[]): Promise<CalisanIsEmriSatiri[]> {
  return db.sorgu<CalisanIsEmriSatiri>(
    // Makine işin terminalde başlatıldığı kullanımdandır, planlı makine yalnız yedektir: Fabrika Haritası çalışan işi bu makinede
    // gösterir ve planlı makine boş ya da farklı olabilir. Açık kullanım önce (planlı makine onlardan biriyse o, yoksa ilk açılan);
    // duraklatma ve duruş kullanımı kapatır, iş o makinede kalır: açık yoksa son kapanan.
    `SELECT DISTINCT ON (i.uretim_emri_id) i.uretim_emri_id AS "emirId", i.id, i.op_no AS "opNo", i.ad,
            COALESCE(k.makine_id, i.makine_id) AS "makineId"
       FROM uretim_emirleri_is_emri i
       LEFT JOIN LATERAL (
         SELECT m.makine_id FROM uretim_emirleri_makine_kullanimi m
          WHERE m.is_emri_id = i.id AND m.makine_id IS NOT NULL
          ORDER BY m.bitis IS NULL DESC, (m.bitis IS NULL AND m.makine_id IS NOT DISTINCT FROM i.makine_id) DESC,
                   CASE WHEN m.bitis IS NULL THEN m.baslama END, m.baslama DESC, m.id DESC LIMIT 1
       ) k ON true
      WHERE i.uretim_emri_id = ANY($1::int[]) AND i.durum = 'calisiyor'
      ORDER BY i.uretim_emri_id, i.sira`,
    [[...emirIdleri]],
  );
}

export interface SonOlaySatiri {
  id: string;
  olay: SonOlayTuru;
  emirId: number;
  emirNo: string;
  parcaNo: string;
  isEmriId: number | null;
  opNo: number | null;
  isEmriAd: string | null;
  makineId: number | null;
  istasyonId: number;
  kisiId: number;
  adet: number | null;
  durusNedeniId: number | null;
  // Yalnız kalite kararında dolu olabilir; sütundan önceki karar satırında bilinmez (null).
  kararVerenId: number | null;
  zaman: string;
}

// Üç defter bütün emirlerde tek akış; kimlik kaynak harfi ve satır kimliğidir; karar satırı karar anıyla süzülür ve sıralanır. Süzgeç ve sınır her kolda ayrıdır:
// genelin ilk N satırı kolların ilk N satırları içindedir, birleşim bütün tarihçeyi sıralamaz ve zaman dizini kullanılır. Aynı anda başlatma en eski, bitirme en yeni sayılır (emir defteriyle aynı sıra);
// ayrı defterlerde an, sıra ve satır no eşitse kimlik ayırır, sayfa sınırında sıra oynamaz.
export function sonOlaylarGetir(db: Db, sonra: string | null, sayi: number): Promise<SonOlaySatiri[]> {
  return db.sorgu<SonOlaySatiri>(
    `SELECT b.id, b.olay, e.id AS "emirId", e.emir_no AS "emirNo", e.parca_no AS "parcaNo",
            i.id AS "isEmriId", i.op_no AS "opNo", i.ad AS "isEmriAd", i.makine_id AS "makineId",
            b.istasyon_id AS "istasyonId", b.kisi_id AS "kisiId", b.adet, b.durus_nedeni_id AS "durusNedeniId",
            b.karar_veren_kisi_id AS "kararVerenId", ${ISO('b.an')} AS zaman
       FROM (
         (SELECT 'k' || k.id AS id, k.emir_id, k.is_emri_id, k.istasyon_id, k.kisi_id, k.olay, k.saglam_adet AS adet,
                NULL::int AS durus_nedeni_id, NULL::int AS karar_veren_kisi_id, k.zaman AS an, CASE k.olay WHEN 'baslat' THEN 0 ELSE 2 END AS sira,
                k.id AS satir
           FROM uretim_kaydi k WHERE $1::timestamptz IS NULL OR k.zaman > $1::timestamptz
          ORDER BY k.zaman DESC, sira DESC, k.id DESC LIMIT $2)
         UNION ALL
         (SELECT 'o' || o.id, o.emir_id, o.is_emri_id, o.istasyon_id, o.kisi_id, o.olay, NULL, o.durus_nedeni_id, NULL, o.zaman, 1, o.id
           FROM uretim_olayi o WHERE $1::timestamptz IS NULL OR o.zaman > $1::timestamptz
          ORDER BY o.zaman DESC, o.id DESC LIMIT $2)
         UNION ALL
         (SELECT 's' || s.id, s.emir_id, s.is_emri_id, s.istasyon_id, s.kisi_id,
                CASE WHEN s.tur = 'hurda' THEN 'hurda' WHEN s.tur = 'red' THEN 'kalite_red' WHEN ${KARAR_SATIRI} THEN 'kalite_onay'
                     WHEN s.duzeltme THEN 'duzeltme' ELSE 'saglam' END,
                s.adet, NULL, s.karar_veren_kisi_id, COALESCE(s.karar_zamani, s.zaman), 1, s.id
           FROM uretim_sayimi s WHERE s.tur IN ('saglam', 'hurda', 'red')
            AND ($1::timestamptz IS NULL OR s.zaman > $1::timestamptz OR s.karar_zamani > $1::timestamptz)
          ORDER BY COALESCE(s.karar_zamani, s.zaman) DESC, s.id DESC LIMIT $2)
       ) b
       JOIN uretim_emri e ON e.id = b.emir_id
       LEFT JOIN uretim_emirleri_is_emri i ON i.id = b.is_emri_id
      ORDER BY b.an DESC, b.sira DESC, b.satir DESC, b.id DESC
      LIMIT $2`,
    [sonra, sayi],
  );
}

// Kişinin şu an çalıştığı istasyon: açık makine kullanımı ya da açık katılımdan en son başlayanı; açık iş yoksa null.
export async function kisininAcikIstasyonu(db: Db, kisiId: number): Promise<number | null> {
  return (await db.tek<{ istasyonId: number }>(
    `SELECT istasyon_id AS "istasyonId" FROM (
       SELECT istasyon_id, baslama AS zaman FROM uretim_emirleri_makine_kullanimi WHERE kisi_id = $1 AND bitis IS NULL
       UNION ALL
       SELECT istasyon_id, giris AS zaman FROM uretim_emirleri_katilim WHERE kisi_id = $1 AND cikis IS NULL
     ) acik ORDER BY zaman DESC LIMIT 1`, [kisiId]))?.istasyonId ?? null;
}

// 2125-1 b: kişinin şu an içinde olduğu işler (açık katılım) ve her birinin açık makine kullanımları; makinesiz işte tek satır, makine null.
// Duraklatma ve durdurma katılımı da kullanımı da kapatır: satırlar çalışan işlerdir. Makine sırasıyla, en son girilen iş önce.
export interface KisiAcikIsSatiri {
  emirId: number;
  emirNo: string;
  isEmriId: number | null;
  opNo: number | null;
  istasyonId: number;
  makineId: number | null;
  giris: string;
}

export function kisininAcikIsleriGetir(db: Db, kisiId: number): Promise<KisiAcikIsSatiri[]> {
  return db.sorgu<KisiAcikIsSatiri>(
    `SELECT ka.emir_id AS "emirId", e.emir_no AS "emirNo", ka.is_emri_id AS "isEmriId", ie.op_no AS "opNo", ka.istasyon_id AS "istasyonId",
            k.makine_id AS "makineId", ${ISO('ka.giris')} AS giris
       FROM uretim_emirleri_katilim ka
       JOIN uretim_emri e ON e.id = ka.emir_id
       LEFT JOIN uretim_emirleri_is_emri ie ON ie.id = ka.is_emri_id
       LEFT JOIN uretim_emirleri_makine_kullanimi k ON k.emir_id = ka.emir_id AND k.is_emri_id IS NOT DISTINCT FROM ka.is_emri_id
                                                    AND k.makine_id IS NOT NULL AND k.bitis IS NULL
      WHERE ka.kisi_id = $1 AND ka.cikis IS NULL
      ORDER BY ka.giris DESC, ka.id DESC, k.makine_id`,
    [kisiId],
  );
}

/* ---------------- kişinin özeti (kart #1295, Operatör Özetim) ---------------- */

export interface KisiIsEmriSatiri {
  isEmriId: number | null;
  uretimEmriId: number;
  emirNo: string;
  malzemeNo: number | null;
  parcaNo: string;
  parcaAd: string;
  opNo: number | null;
  adimAdi: string | null;
  istasyonId: number | null;
  makineId: number | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  saglam: number | null;
  hurda: number | null;
  saniye: number | null;
  birimSureDk: string | null;
  adet: number;
}

// Kişinin [baslangic, bitis) içinde sayımı ya da katılımı olan iş emirleri; en son çalışılan önce. İş emirsiz eski emirde
// durum emrinkinden eşlenir. Sayımı olmayan satırda adetler, katılımı olmayanda süre null'dır.
export function kisininIsEmirleriGetir(db: Db, kisiId: number, baslangic: string, bitis: string): Promise<KisiIsEmriSatiri[]> {
  return db.sorgu(
    `WITH say AS (
       SELECT s.emir_id, COALESCE(s.is_emri_id, 0) AS ie, sum(s.adet) FILTER (WHERE s.tur = 'saglam') AS saglam,
              sum(s.adet) FILTER (WHERE s.tur = 'hurda') AS hurda, max(s.zaman) AS son
         FROM uretim_sayimi s WHERE s.kisi_id = $1 AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz GROUP BY 1, 2
     ), kat AS (
       SELECT k.emir_id, COALESCE(k.is_emri_id, 0) AS ie,
              floor(sum(extract(epoch FROM LEAST(COALESCE(k.cikis, now()), $3::timestamptz) - GREATEST(k.giris, $2::timestamptz)))) AS saniye,
              max(LEAST(COALESCE(k.cikis, now()), $3::timestamptz)) AS son
         FROM uretim_emirleri_katilim k
        WHERE k.kisi_id = $1 AND k.giris < $3::timestamptz AND COALESCE(k.cikis, now()) > $2::timestamptz GROUP BY 1, 2
     ), bir AS (
       SELECT COALESCE(say.emir_id, kat.emir_id) AS emir_id, NULLIF(COALESCE(say.ie, kat.ie), 0) AS is_emri_id,
              say.saglam, say.hurda, kat.saniye, GREATEST(say.son, kat.son) AS son
         FROM say FULL JOIN kat ON kat.emir_id = say.emir_id AND kat.ie = say.ie
     )
     SELECT bir.is_emri_id AS "isEmriId", e.id AS "uretimEmriId", e.emir_no AS "emirNo", e.malzeme_no AS "malzemeNo",
            e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", i.op_no AS "opNo", i.ad AS "adimAdi",
            CASE WHEN i.id IS NULL THEN e.istasyon_id ELSE i.istasyon_id END AS "istasyonId", i.makine_id AS "makineId",
            COALESCE(i.durum, CASE e.durum WHEN 'basladi' THEN 'calisiyor' WHEN 'bitti' THEN 'tamam' ELSE 'bekliyor' END) AS durum,
            bir.saglam::int AS saglam, bir.hurda::int AS hurda, bir.saniye::int AS saniye, i.birim_sure_dk::text AS "birimSureDk", e.adet
       FROM bir JOIN uretim_emri e ON e.id = bir.emir_id LEFT JOIN uretim_emirleri_is_emri i ON i.id = bir.is_emri_id
      ORDER BY bir.son DESC, e.id, i.sira`,
    [kisiId, baslangic, bitis],
  );
}

// kisininIsEmirleriGetir'in gün kırılımlı hâli: [sinirlar[g], sinirlar[g + 1]) aralıklarının her biri tek tek okumayla aynı satırları
// aynı sırayla verir; satır hangi aralığa aitse gun onu söyler.
export function kisininGunlukIsEmirleriGetir(
  db: Db, kisiId: number, sinirlar: readonly string[],
): Promise<(KisiIsEmriSatiri & { gun: number })[]> {
  return db.sorgu(
    `WITH g AS (${ARALIKLAR}), say AS (
       SELECT g.gun, s.emir_id, COALESCE(s.is_emri_id, 0) AS ie, sum(s.adet) FILTER (WHERE s.tur = 'saglam') AS saglam,
              sum(s.adet) FILTER (WHERE s.tur = 'hurda') AS hurda, max(s.zaman) AS son
         FROM uretim_sayimi s JOIN g ON s.zaman >= g.bas AND s.zaman < g.bit
        WHERE s.kisi_id = $1 AND s.zaman >= ($2::timestamptz[])[1] AND s.zaman < ($2::timestamptz[])[cardinality($2::timestamptz[])]
        GROUP BY 1, 2, 3
     ), kat AS (
       SELECT g.gun, k.emir_id, COALESCE(k.is_emri_id, 0) AS ie,
              floor(sum(extract(epoch FROM LEAST(COALESCE(k.cikis, now()), g.bit) - GREATEST(k.giris, g.bas)))) AS saniye,
              max(LEAST(COALESCE(k.cikis, now()), g.bit)) AS son
         FROM uretim_emirleri_katilim k JOIN g ON k.giris < g.bit AND COALESCE(k.cikis, now()) > g.bas
        WHERE k.kisi_id = $1 AND k.giris < ($2::timestamptz[])[cardinality($2::timestamptz[])] AND COALESCE(k.cikis, now()) > ($2::timestamptz[])[1]
        GROUP BY 1, 2, 3
     ), bir AS (
       SELECT COALESCE(say.gun, kat.gun) AS gun, COALESCE(say.emir_id, kat.emir_id) AS emir_id, NULLIF(COALESCE(say.ie, kat.ie), 0) AS is_emri_id,
              say.saglam, say.hurda, kat.saniye, GREATEST(say.son, kat.son) AS son
         FROM say FULL JOIN kat ON kat.gun = say.gun AND kat.emir_id = say.emir_id AND kat.ie = say.ie
     )
     SELECT bir.gun, bir.is_emri_id AS "isEmriId", e.id AS "uretimEmriId", e.emir_no AS "emirNo", e.malzeme_no AS "malzemeNo",
            e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", i.op_no AS "opNo", i.ad AS "adimAdi",
            CASE WHEN i.id IS NULL THEN e.istasyon_id ELSE i.istasyon_id END AS "istasyonId", i.makine_id AS "makineId",
            COALESCE(i.durum, CASE e.durum WHEN 'basladi' THEN 'calisiyor' WHEN 'bitti' THEN 'tamam' ELSE 'bekliyor' END) AS durum,
            bir.saglam::int AS saglam, bir.hurda::int AS hurda, bir.saniye::int AS saniye, i.birim_sure_dk::text AS "birimSureDk", e.adet
       FROM bir JOIN uretim_emri e ON e.id = bir.emir_id LEFT JOIN uretim_emirleri_is_emri i ON i.id = bir.is_emri_id
      ORDER BY bir.gun, bir.son DESC, e.id, i.sira`,
    [kisiId, [...sinirlar]],
  );
}

// Net hurda (düzeltme dahil) neden başına; net sıfır olan neden yoktur.
export function kisininHurdalariGetir(db: Db, kisiId: number, baslangic: string, bitis: string): Promise<{ hurdaNedeniId: number; adet: number }[]> {
  return db.sorgu(
    `SELECT s.hurda_nedeni_id AS "hurdaNedeniId", sum(s.adet)::int AS adet
       FROM uretim_sayimi s
      WHERE s.kisi_id = $1 AND s.tur = 'hurda' AND s.hurda_nedeni_id IS NOT NULL AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz
      GROUP BY s.hurda_nedeni_id HAVING sum(s.adet) <> 0
      ORDER BY adet DESC, s.hurda_nedeni_id`,
    [kisiId, baslangic, bitis],
  );
}

// Kişi başına net sağlamın iş emri birim süresiyle standart süresi (saniye, yuvarlanmış) ve birim süresi olmayan iş emrindeki sağlam.
export function standartSureleriGetir(
  db: Db, kirilim: SayimKirilimi, idler: readonly number[], baslangic: string, bitis: string,
): Promise<{ id: number; standartSaniye: number; suresizSaglam: number }[]> {
  const { kimlik, kaynak } = KIRILIM[kirilim];
  return db.sorgu(
    `SELECT ${kimlik} AS id,
            round(COALESCE(sum(s.adet * i.birim_sure_dk * 60) FILTER (WHERE i.birim_sure_dk IS NOT NULL), 0))::int AS "standartSaniye",
            COALESCE(sum(s.adet) FILTER (WHERE i.birim_sure_dk IS NULL), 0)::int AS "suresizSaglam"
       FROM ${kaynak} LEFT JOIN uretim_emirleri_is_emri i ON i.id = s.is_emri_id
      WHERE ${kimlik} = ANY($1::int[]) AND s.tur = 'saglam' AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz
      GROUP BY ${kimlik}`,
    [[...idler], baslangic, bitis],
  );
}

export function isEmriPlanBilgileriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<{
  id: number; uretimEmriId: number; opNo: number; adet: number; ayarSureDk: string | null; birimSureDk: string | null;
  makineId: number | null; kisiId: number | null; fasonFirmaId: number | null; istasyonId: number | null;
}[]> {
  return db.sorgu(
    `SELECT i.id, i.uretim_emri_id AS "uretimEmriId", i.op_no AS "opNo", e.adet, i.ayar_suresi_dk::text AS "ayarSureDk",
            i.birim_sure_dk::text AS "birimSureDk", i.makine_id AS "makineId", i.kisi_id AS "kisiId", i.fason_firma_id AS "fasonFirmaId", i.istasyon_id AS "istasyonId"
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
      WHERE i.id = ANY($1::int[])`,
    [[...isEmriIdleri]],
  );
}

// Üretim anomalisi ve plan sapması (kart 764, 782): iş emrinin gerçek zamanları ve çalıştığı makineler. Ayar başı iş emrine bağlı ilk
// ayar olayıdır; iş emri bağı boş eski olay ve kullanım satırı sayılmaz (hangi adıma ait olduğu bilinmez).
export interface IsEmriZamanSatiri {
  isEmriId: number; uretimEmriId: number; opNo: number; durum: 'bekliyor' | 'calisiyor' | 'tamam'; ayarBasi: string | null; baslama: string | null;
  bitis: string | null; bagimlilik: 'bagimsiz' | 'bekleyen' | 'akisli'; devirAdedi: number | null; emirTeslim: string | null;
  makineler: { makineId: number | null; baslama: string; bitis: string | null }[];
}
export function isEmriZamanlariGetir(db: Db, isEmriIdleri: readonly number[]): Promise<IsEmriZamanSatiri[]> {
  return db.sorgu(
    `SELECT i.id AS "isEmriId", i.uretim_emri_id AS "uretimEmriId", i.op_no AS "opNo", i.durum,
            (SELECT ${ISO('min(o.zaman)')} FROM uretim_olayi o WHERE o.is_emri_id = i.id AND o.olay = 'ayar') AS "ayarBasi",
            ${ISO('i.baslama')} AS baslama, ${ISO('i.bitis')} AS bitis, i.bagimlilik, i.devir_adedi AS "devirAdedi", ${TARIH('e.teslim')} AS "emirTeslim",
            COALESCE((SELECT json_agg(json_build_object('makineId', k.makine_id, 'baslama', ${ISO('k.baslama')}, 'bitis', ${ISO('k.bitis')}) ORDER BY k.baslama, k.id)
                        FROM uretim_emirleri_makine_kullanimi k WHERE k.is_emri_id = i.id), '[]'::json) AS makineler
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
      WHERE i.id = ANY($1::int[])
      ORDER BY i.id`,
    [[...isEmriIdleri]],
  );
}

// 1979: adımın kişi başına net saydığı (sağlam ve ilk parça kararı bekleyen, düzeltme dahil); pay ilerlemesi bundan okunur.
export const kisiSaglamlariGetir = (db: Db, isEmriId: number): Promise<{ kisiId: number; saglam: number }[]> =>
  db.sorgu(
    `SELECT kisi_id AS "kisiId", sum(adet)::int AS saglam FROM uretim_sayimi WHERE is_emri_id = $1 AND tur IN ('saglam', 'karar_bekliyor') GROUP BY kisi_id ORDER BY kisi_id`,
    [isEmriId],
  );

// 2009 b: adımın makine başına net saydığı (sağlam ve karar bekleyen); makine payının ilerlemesi bundan okunur. Makinesiz satır sayılmaz.
export const makineSaglamlariGetir = (db: Db, isEmriId: number): Promise<{ makineId: number; saglam: number }[]> =>
  db.sorgu(
    `SELECT makine_id AS "makineId", sum(adet)::int AS saglam FROM uretim_sayimi
      WHERE is_emri_id = $1 AND makine_id IS NOT NULL AND tur IN ('saglam', 'karar_bekliyor') GROUP BY makine_id ORDER BY makine_id`,
    [isEmriId],
  );

// 2009 b: adımın açık makine kullanımları ve açan kişi, açılış sırasıyla; sayımın makinesi bundan seçilir.
export const adiminAcikMakineleri = (db: Db, isEmriId: number): Promise<{ makineId: number; kisiId: number }[]> =>
  db.sorgu(
    `SELECT makine_id AS "makineId", kisi_id AS "kisiId" FROM uretim_emirleri_makine_kullanimi
      WHERE is_emri_id = $1 AND makine_id IS NOT NULL AND bitis IS NULL ORDER BY baslama, id`,
    [isEmriId],
  );

export interface MakinedekiIsSatiri {
  makineId: number;
  emirId: number;
  emirNo: string;
  isEmriId: number;
  opNo: number;
  opAdi: string;
}

// Makinede şu an açık kullanımın emri ve adımı (makinede aynı anda tek açık kullanım vardır). Adımsız kullanım satır vermez.
export const makinelerdekiIslerGetir = (db: Db, makineIdleri: readonly number[]): Promise<MakinedekiIsSatiri[]> =>
  db.sorgu<MakinedekiIsSatiri>(
    `SELECT m.makine_id AS "makineId", e.id AS "emirId", e.emir_no AS "emirNo", i.id AS "isEmriId", i.op_no AS "opNo", i.ad AS "opAdi"
       FROM uretim_emirleri_makine_kullanimi m
       JOIN uretim_emri e ON e.id = m.emir_id
       JOIN uretim_emirleri_is_emri i ON i.id = m.is_emri_id
      WHERE m.makine_id = ANY($1::int[]) AND m.bitis IS NULL
      ORDER BY m.makine_id`,
    [[...makineIdleri]],
  );
