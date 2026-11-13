import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { KaliteDurumu, MalzemeIstegiDurumu, TeslimDurumu } from '#paylasilan/sozlesme/stok.ts';
import { DEFTER_FARKI_SECIMI, KULLANILABILIR_SQL, MALZEME_KAYNAGI } from '../ortak/sorgular.ts';

// ---- İş kutusu ve dışa açık okumalar -----------------------------------------------------------------------------------------
export const isKutusuSayilari = (db: Db): Promise<{ kabuldeBekleyen: number; eksiBakiye: number; kritik: number; logoFarki: number; logoHatasi: number } | null> => db.tek(
  `SELECT (SELECT count(DISTINCT b.malzeme_id)::int FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE k.tur = 'kabul' AND b.miktar > 0) AS "kabuldeBekleyen",
     (SELECT count(*)::int FROM stok_bakiye WHERE miktar < 0) AS "eksiBakiye",
     (SELECT count(*)::int FROM stok_malzeme_ayari a WHERE a.kritik_seviye IS NOT NULL
        AND COALESCE((SELECT sum(miktar) FROM stok_bakiye b WHERE b.malzeme_id = a.malzeme_id AND b.statu_id IS NULL AND b.${KULLANILABILIR_SQL}), 0) <= a.kritik_seviye) AS kritik,
     (SELECT count(*)::int FROM stok_mal_kabul_satiri WHERE logo_durumu = 'fark_var') AS "logoFarki",
     (SELECT count(*)::int FROM stok_hareketi_logo WHERE logo_gonderim_durumu = 'hata') AS "logoHatasi"`);
export const stokMiktarlari = (db: Db, malzemeIdler: number[]): Promise<{ malzemeId: number; toplam: string; kullanilabilir: string; uretimde: string }[]> => db.sorgu(
  `SELECT b.malzeme_id AS "malzemeId", sum(b.miktar)::text AS toplam,
     COALESCE(sum(b.miktar) FILTER (WHERE k.tur IN ('raf_gozu', 'kabul', 'depo_zemini') AND b.statu_id IS NULL AND b.${KULLANILABILIR_SQL}), 0)::text AS kullanilabilir,
     COALESCE(sum(b.miktar) FILTER (WHERE k.tur = 'uretim_cikisi'), 0)::text AS uretimde
   FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE b.malzeme_id = ANY($1::int[]) GROUP BY b.malzeme_id`, [malzemeIdler]);
// Kartın bütün konumlardaki toplamı ve kritik seviyesi; bakiyesi ve ayarı olmayan kart dönmez (Malzemeler listesiyle aynı kaynak).
export const malzemeToplamlari = (db: Db, malzemeIdler: number[]): Promise<{ malzemeId: number; toplam: string; serbest: string; kritikSeviye: string | null }[]> => db.sorgu(
  `SELECT m.malzeme_id AS "malzemeId", t.toplam::text AS toplam, t.serbest::text AS serbest, a.kritik_seviye AS "kritikSeviye" ${MALZEME_KAYNAGI} WHERE m.malzeme_id = ANY($1::int[])`, [malzemeIdler]);
export const dusukStokSayisi = async (db: Db): Promise<number> => (await db.tek<{ n: number }>(
  `SELECT count(*)::int AS n FROM stok_malzeme_ayari a WHERE a.kritik_seviye IS NOT NULL
     AND COALESCE((SELECT sum(miktar) FROM stok_bakiye b WHERE b.malzeme_id = a.malzeme_id AND b.statu_id IS NULL AND b.${KULLANILABILIR_SQL}), 0) <= a.kritik_seviye`))?.n ?? 0;
// Emre net çıkan miktar: sarf çıkışları eksi geri alınanlar (geri alma ters yöndedir).
// Emirlere verilmiş net sarf, emir ve malzeme başına: üretime sarf ve hurdanın fire çıkışı (337 a); geri alma, geri aldığı hareketin emri ve
// türüyle düşülür. ilkSarf: emre ilk üretime sarf çıkışının zamanı (PM-B17, bekleme finansmanı malzemeyi bu günden sayar); geri alma bu zamanı değiştirmez.
export const emirlerinNetSarfi = (db: Db, emirIdler: readonly number[]): Promise<{ emirId: number; malzemeId: number; miktar: string; ilkSarf: string | null }[]> => db.sorgu(
  `SELECT a.uretim_emri_id AS "emirId", h.malzeme_id AS "malzemeId", sum(CASE WHEN h.tur = 'cikis' THEN h.miktar ELSE -h.miktar END)::text AS miktar,
     ${zamanMetni("min(h.zaman) FILTER (WHERE h.tur = 'cikis' AND h.cikis_nedeni = 'uretime_sarf')")} AS "ilkSarf"
   FROM stok_hareketi h JOIN stok_hareketi a ON a.id = COALESCE(h.geri_alinan_id, h.id)
   WHERE a.uretim_emri_id = ANY($1::int[]) AND a.tur = 'cikis' AND a.cikis_nedeni IN ('uretime_sarf', 'fire')
   GROUP BY a.uretim_emri_id, h.malzeme_id`, [[...emirIdler]]);
// 2727-1: emirlerinNetSarfi'nın kapsamındaki geri alınmamış çıkışlar, tek tek ve anıyla (son alış fiyatı çıkış anına göre). Geri alma
// bütün miktarı çevirdiğinden geri alınan çıkış ile geri alması birlikte dışarıdadır; net miktar bu satırların toplamına eşittir.
export const emirlerinSarfCikislari = (db: Db, emirIdler: readonly number[]): Promise<{ emirId: number; malzemeId: number; zaman: string; miktar: string }[]> => db.sorgu(
  `SELECT h.uretim_emri_id AS "emirId", h.malzeme_id AS "malzemeId", ${zamanMetni('h.zaman')} AS zaman, h.miktar::text AS miktar
   FROM stok_hareketi h
   WHERE h.uretim_emri_id = ANY($1::int[]) AND h.tur = 'cikis' AND h.cikis_nedeni IN ('uretime_sarf', 'fire')
     AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
   ORDER BY h.zaman, h.id`, [[...emirIdler]]);
// B-2482-8, 2534: emrin statü zincirindeki malzemesi, emir ve malzeme başına: statüde emre ayrılan (stok_rezerve, statülü satır). Çevirme
// ayrılanı statüye taşır, statüden sarf ve fire düşer; parti birleşince ayrılan hedef emre geçer, müdür kaldırınca emirden çıkar. Hareketten
// okunsaydı birleşen emrin zinciri kaynakta kalırdı. Emre verilenin bir parçasıdır: emirlerinNetSarfi statüden sarfı sayar, ayrılan sarfla
// düştüğü için toplam çift saymaz.
export const emirlerinZincirdekiMiktari = (db: Db, emirIdler: readonly number[]): Promise<{ emirId: number; malzemeId: number; miktar: string }[]> => db.sorgu(
  `SELECT uretim_emri_id AS "emirId", malzeme_id AS "malzemeId", sum(miktar)::text AS miktar
     FROM stok_rezerve WHERE uretim_emri_id = ANY($1::int[]) AND statu_id IS NOT NULL
    GROUP BY 1, 2 HAVING sum(miktar) <> 0 ORDER BY 1, 2`,
  [[...emirIdler]]);
// 2547 a: statüdeki stok, malzeme, statü ve kalite başına (toplamı artı olan), bulunduğu konumların kodlarıyla. Emre ayrılanı ve redi
// kurallar.sahipsizStatuluHesapla düşer (açık emir süzmesi uretim-emirlerinin durumuyla).
// malzemeIdler verilirse yalnız o malzemeler (2610 a önizlemesi); verilmezse bütün statülü stok.
export const statuluStoklar = (
  db: Db, malzemeIdler: readonly number[] | null = null,
): Promise<{ malzemeId: number; statuId: number; kaliteDurumu: KaliteDurumu; miktar: string; konumlar: string[] }[]> => db.sorgu(
  `SELECT b.malzeme_id AS "malzemeId", b.statu_id AS "statuId", b.kalite_durumu AS "kaliteDurumu", sum(b.miktar)::text AS miktar,
          COALESCE(array_agg(DISTINCT k.kod ORDER BY k.kod) FILTER (WHERE b.miktar > 0), '{}') AS konumlar
     FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
    WHERE b.statu_id IS NOT NULL AND ($1::int[] IS NULL OR b.malzeme_id = ANY($1::int[])) GROUP BY 1, 2, 3 HAVING sum(b.miktar) > 0 ORDER BY 1, 2, 3`,
  [malzemeIdler === null ? null : [...malzemeIdler]]);
// 2561 a: malzeme ve statü başına son hareket zamanı (statüye giren ya da çıkan) ve statüye son sokan emrin kimliği (yoksa null).
export const statuSonHareketleri = (db: Db, malzemeIdler: readonly number[]): Promise<{ malzemeId: number; statuId: number; sonHareket: string; kaynakEmirId: number | null }[]> => db.sorgu(
  `WITH h AS (
     SELECT h.id, h.malzeme_id, h.zaman, h.uretim_emri_id, s.statu_id, s.giren
       FROM stok_hareketi h CROSS JOIN LATERAL (VALUES (h.kaynak_statu_id, false), (h.hedef_statu_id, true)) AS s(statu_id, giren)
      WHERE h.malzeme_id = ANY($1::int[]) AND s.statu_id IS NOT NULL)
   SELECT malzeme_id AS "malzemeId", statu_id AS "statuId", ${zamanMetni('max(zaman)')} AS "sonHareket",
          (array_agg(uretim_emri_id ORDER BY zaman DESC, id DESC) FILTER (WHERE giren AND uretim_emri_id IS NOT NULL))[1] AS "kaynakEmirId"
     FROM h GROUP BY 1, 2 ORDER BY 1, 2`, [[...malzemeIdler]]);
// 2554: emrin bir malzemesinin iki statü arasındaki çevirmeleri (net, geri çevirme düşülmüş). ust: öncül statüye giren (bu statüden geri
// gelen hariç); bu: öncül statüden bu statüye geçen. Aynı statüde yer değiştirme iki tarafta da sayılır, net sıfırdır.
export const emrinStatuAkisi = async (db: Db, g: { uretimEmriId: number; malzemeId: number; oncekiStatuId: number; statuId: number }): Promise<{ ust: string; bu: string }> => (await db.tek<{ ust: string; bu: string }>(
  `SELECT (COALESCE(sum(miktar) FILTER (WHERE hedef_statu_id = $3 AND kaynak_statu_id IS DISTINCT FROM $4), 0)
         - COALESCE(sum(miktar) FILTER (WHERE kaynak_statu_id = $3 AND hedef_statu_id IS DISTINCT FROM $4), 0))::text AS ust,
          (COALESCE(sum(miktar) FILTER (WHERE kaynak_statu_id = $3 AND hedef_statu_id = $4), 0)
         - COALESCE(sum(miktar) FILTER (WHERE kaynak_statu_id = $4 AND hedef_statu_id = $3), 0))::text AS bu
     FROM stok_hareketi WHERE uretim_emri_id = $1 AND malzeme_id = $2 AND tur = 'transfer'`,
  [g.uretimEmriId, g.malzemeId, g.oncekiStatuId, g.statuId]))!;
// 335: emir başına fiş hareketleri, malzeme başına net. Geri alma, geri aldığı hareketin emri ve türüyle sayılır (geri alma geri alınmaz,
// tek geri alma kısıtı vardır). fis: sarf (üretime sarf ve fire çıkışı) ya da giris (üretim girişi); hurda fire çıkışıdır.
export const emirlerinFisHareketleri = (db: Db, emirIdler: readonly number[]): Promise<{ emirId: number; fis: 'sarf' | 'giris'; malzemeId: number; miktar: string; hurda: string }[]> => db.sorgu(
  `WITH k AS (
     SELECT a.uretim_emri_id AS emir_id, h.malzeme_id, a.tur, a.cikis_nedeni, a.giris_kaynagi, CASE WHEN h.tur = 'geri_alma' THEN -h.miktar ELSE h.miktar END AS miktar
     FROM stok_hareketi h JOIN stok_hareketi a ON a.id = COALESCE(h.geri_alinan_id, h.id)
     WHERE a.uretim_emri_id = ANY($1::int[])
       AND ((a.tur = 'cikis' AND a.cikis_nedeni IN ('uretime_sarf', 'fire')) OR (a.tur = 'giris' AND a.giris_kaynagi = 'uretim')))
   SELECT emir_id AS "emirId", CASE WHEN tur = 'giris' THEN 'giris' ELSE 'sarf' END AS fis, malzeme_id AS "malzemeId", sum(miktar)::text AS miktar,
     COALESCE(sum(miktar) FILTER (WHERE cikis_nedeni = 'fire'), 0)::text AS hurda
   FROM k GROUP BY 1, 2, 3 HAVING sum(miktar) <> 0 OR COALESCE(sum(miktar) FILTER (WHERE cikis_nedeni = 'fire'), 0) <> 0 ORDER BY 1, 2, 3`, [[...emirIdler]]);
// Emre verilmiş net sarf, parti başına: üretime sarf ve hurdanın fire çıkışı (339 a, emirlerinNetSarfi ile aynı kural).
export const emrinPartileri = (db: Db, emirId: number): Promise<{ partiId: number | null; malzemeId: number; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; miktar: string }[]> => db.sorgu(
  `SELECT h.parti_id AS "partiId", h.malzeme_id AS "malzemeId", p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo",
     sum(CASE WHEN h.tur = 'cikis' THEN h.miktar ELSE -h.miktar END)::text AS miktar
   FROM stok_hareketi h JOIN stok_hareketi a ON a.id = COALESCE(h.geri_alinan_id, h.id) LEFT JOIN stok_parti p ON p.id = h.parti_id
   WHERE a.uretim_emri_id = $1 AND a.tur = 'cikis' AND a.cikis_nedeni IN ('uretime_sarf', 'fire')
   GROUP BY h.parti_id, h.malzeme_id, p.lot_no, p.tedarikci_parti_no, p.dokum_no
   HAVING sum(CASE WHEN h.tur = 'cikis' THEN h.miktar ELSE -h.miktar END) <> 0
   ORDER BY h.malzeme_id, h.parti_id NULLS LAST`, [emirId]);
export interface AkisHareketi {
  id: number; zaman: string; tur: 'giris' | 'cikis' | 'transfer' | 'sayim_fazla' | 'sayim_eksik' | 'geri_alma';
  malzemeId: number; partiId: number | null; miktar: string; kaynakStatuId: number | null; hedefStatuId: number | null;
  girisKaynagi: string | null; cikisNedeni: string | null; kaynakKonumTur: string | null; hedefKonumTur: string | null; geriAlinanId: number | null;
  // 2224: Parçayı izle konumdan konuma yolu çizer; konumun kimliği, kodu, adı ve bağlı istasyonu.
  kaynakKonumId: number | null; kaynakKonumKod: string | null; kaynakKonumAd: string | null; kaynakIstasyonId: number | null;
  hedefKonumId: number | null; hedefKonumKod: string | null; hedefKonumAd: string | null; hedefIstasyonId: number | null;
}
// Statü çevirme ve sevk çıkışı emri taşımaz; emrin partisi ve emrin teslimleri üzerinden bulunur. UNION tekrarı atar.
export const emrinAkisHareketleri = (db: Db, emirId: number): Promise<AkisHareketi[]> => db.sorgu(
  `WITH kimlikler AS (
     SELECT id FROM stok_hareketi WHERE uretim_emri_id = $1
     UNION SELECT h.id FROM stok_hareketi h JOIN stok_parti p ON p.id = h.parti_id WHERE p.uretim_emri_id = $1
     UNION SELECT t.hareket_id FROM stok_teslim t WHERE t.uretim_emri_id = $1 AND t.hareket_id IS NOT NULL)
   SELECT h.id::int, ${zamanMetni('h.zaman')} AS zaman, h.tur, h.malzeme_id AS "malzemeId", h.parti_id::int AS "partiId", h.miktar::text AS miktar,
     h.kaynak_statu_id AS "kaynakStatuId", h.hedef_statu_id AS "hedefStatuId", h.giris_kaynagi AS "girisKaynagi", h.cikis_nedeni AS "cikisNedeni",
     kk.tur AS "kaynakKonumTur", hk.tur AS "hedefKonumTur", h.geri_alinan_id::int AS "geriAlinanId",
     kk.id AS "kaynakKonumId", kk.kod AS "kaynakKonumKod", kk.ad AS "kaynakKonumAd", kk.istasyon_id AS "kaynakIstasyonId",
     hk.id AS "hedefKonumId", hk.kod AS "hedefKonumKod", hk.ad AS "hedefKonumAd", hk.istasyon_id AS "hedefIstasyonId"
   FROM kimlikler i JOIN stok_hareketi h ON h.id = i.id
   LEFT JOIN stok_konum kk ON kk.id = h.kaynak_konum_id LEFT JOIN stok_konum hk ON hk.id = h.hedef_konum_id
   ORDER BY h.zaman, h.id`, [emirId]);
// Refakat kartının kapsamı (kart #708, Akış Süresi): kartla sayılan üretim partileri ve kartın lotuyla ya da bu partilerle emre
// yapılmış teslimler (kartın "verilen" hesabıyla aynı seçim). Teslim kartı ayrıca taşımaz; emir ve parti seçer.
export const refakatCiktiPartiIdleri = async (db: Db, id: number): Promise<number[]> =>
  (await db.sorgu<{ id: number }>('SELECT id::int FROM stok_parti WHERE refakat_partisi_id = $1 ORDER BY id', [id])).map((x) => x.id);
export interface KartTeslimi {
  id: number; no: string; durum: 'yolda' | 'teslim' | 'red' | 'iptal'; partiId: number; malzemeId: number; miktar: string; alinan: string | null;
  gonderim: string; kapanis: string | null; kaynak: string; hedef: string; gonderenKisiId: number; kapatanKisiId: number | null;
}
export const kartTeslimleri = (db: Db, uretimEmriId: number, partiIdler: readonly number[]): Promise<KartTeslimi[]> => db.sorgu(
  `SELECT t.id, t.no, t.durum, t.parti_id::int AS "partiId", t.malzeme_id AS "malzemeId", t.miktar::text AS miktar, t.alinan::text AS alinan,
     ${zamanMetni('t.gonderim')} AS gonderim, ${zamanMetni('t.kapanis')} AS kapanis, COALESCE(kk.ad, kk.kod) AS kaynak, COALESCE(hk.ad, hk.kod) AS hedef,
     t.gonderen_kisi_id AS "gonderenKisiId", t.kapatan_kisi_id AS "kapatanKisiId"
   FROM stok_teslim t JOIN stok_konum kk ON kk.id = t.kaynak_konum_id JOIN stok_konum hk ON hk.id = t.hedef_konum_id
   WHERE t.uretim_emri_id = $1 AND t.parti_id = ANY($2::bigint[]) ORDER BY t.gonderim, t.id`, [uretimEmriId, partiIdler]);
// Üretim anomalisi (kart 764): emre ya da iş emrine bağlı teslimler ve istekler, zamanlarıyla. İstek tablosunda kapanış sütunu yoktur;
// istek yalnız açık durumdan güncellenir (istekGecir, istekReddet), bu yüzden kapalı istekte son güncelleme kapanış anıdır.
export interface EmirTeslimSatiri {
  teslimId: number; no: string; isEmriId: number | null; uretimEmriId: number | null; malzemeId: number; hedefIstasyonId: number | null;
  durum: TeslimDurumu; gonderim: string; kapanis: string | null;
}
export const emirTeslimleri = (db: Db, uretimEmriIdler: readonly number[], isEmriIdler: readonly number[]): Promise<EmirTeslimSatiri[]> => db.sorgu(
  `SELECT t.id AS "teslimId", t.no, t.is_emri_id AS "isEmriId", t.uretim_emri_id AS "uretimEmriId", t.malzeme_id AS "malzemeId",
     hk.istasyon_id AS "hedefIstasyonId", t.durum, ${zamanMetni('t.gonderim')} AS gonderim, ${zamanMetni('t.kapanis')} AS kapanis
   FROM stok_teslim t JOIN stok_konum hk ON hk.id = t.hedef_konum_id
   WHERE t.uretim_emri_id = ANY($1::int[]) OR t.is_emri_id = ANY($2::int[]) ORDER BY t.gonderim, t.id`, [[...uretimEmriIdler], [...isEmriIdler]]);
export interface EmirIstekSatiri {
  istekId: number; no: string; uretimEmriId: number; malzemeId: number; istasyonId: number | null; durum: MalzemeIstegiDurumu; acilis: string; kapanis: string | null;
}
export const emirIstekleri = (db: Db, uretimEmriIdler: readonly number[]): Promise<EmirIstekSatiri[]> => db.sorgu(
  `SELECT i.id AS "istekId", i.no, i.uretim_emri_id AS "uretimEmriId", i.malzeme_id AS "malzemeId", i.istasyon_id AS "istasyonId", i.durum,
     ${zamanMetni('i.acilis')} AS acilis, CASE WHEN i.durum IN ('teslim', 'iptal') THEN ${zamanMetni('i.guncelleme')} END AS kapanis
   FROM stok_malzeme_istegi i WHERE i.uretim_emri_id = ANY($1::int[]) ORDER BY i.acilis, i.id`, [[...uretimEmriIdler]]);
// Partinin en eski mal kabul zamanı; mal kabulle girmemiş parti (üretim partisi) null taşır.
export const partiGirisZamanlari = (db: Db, partiIdler: number[]): Promise<{ partiId: number; lotNo: string; malKabulZamani: string | null }[]> => db.sorgu(
  `SELECT p.id::int AS "partiId", p.lot_no AS "lotNo", ${zamanMetni('min(m.zaman)')} AS "malKabulZamani"
   FROM stok_parti p LEFT JOIN stok_mal_kabul_satiri s ON s.parti_id = p.id LEFT JOIN stok_mal_kabul m ON m.id = s.mal_kabul_id
   WHERE p.id = ANY($1::bigint[]) GROUP BY p.id, p.lot_no`, [partiIdler]);
// 3118: partinin tedarikçi kimliği (GKK formu); olmayan parti dönmez.
export const partiKimlikleri = (db: Db, partiIdler: readonly number[]): Promise<{ partiId: number; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null }[]> => db.sorgu(
  `SELECT p.id::int AS "partiId", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.sertifika_no AS "sertifikaNo"
   FROM stok_parti p WHERE p.id = ANY($1::bigint[])`, [[...partiIdler]]);
// Tedarikçi partileri (üretim partisi değil), yeniden eskiye; liste ekranı için sınırlı.
export const sonPartiler = (db: Db, malzemeId: number, sinir: number): Promise<{ partiId: number; lotNo: string; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null; kayitZamani: string }[]> => db.sorgu(
  `SELECT p.id::int AS "partiId", p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.sertifika_no AS "sertifikaNo", ${zamanMetni('p.kayit_zamani')} AS "kayitZamani"
   FROM stok_parti p WHERE p.malzeme_id = $1 AND p.uretim_emri_id IS NULL ORDER BY p.kayit_zamani DESC, p.id DESC LIMIT $2`, [malzemeId, sinir]);
// Aynı emrin tamamlaması sıraya girer: ikinci istek ilk işlem bitince yeniden hesaplar (kilit işlem sonunda bırakılır).
export const emirTamamlamaKilidi = async (db: Db, emirId: number): Promise<void> => {
  await islemKilidiAl(db, 'stok_emir_tamamlama', emirId);
};
// Emrin ürününden üretim girişiyle giren net miktar: üretim girişinin geri alması kaynaktan düşer (hedefi yoktur).
export const emirUretimGirisi = async (db: Db, emirId: number, malzemeId: number): Promise<string> => (await db.sorgu<{ miktar: string }>(
  `SELECT COALESCE(sum(CASE WHEN tur = 'giris' THEN miktar ELSE -miktar END), 0)::text AS miktar FROM stok_hareketi
   WHERE uretim_emri_id = $1 AND malzeme_id = $2
     AND (giris_kaynagi = 'uretim' OR (tur = 'geri_alma' AND kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NULL))`, [emirId, malzemeId]))[0]?.miktar ?? '0';
export const konumKodlari = (db: Db, idler: number[]): Promise<{ id: number; kod: string }[]> =>
  db.sorgu('SELECT id, kod FROM stok_konum WHERE id = ANY($1::int[])', [idler]);
export const bakiyeDefterFarki = (db: Db): Promise<{ malzemeId: number; konumId: number; partiId: number | null; bakiye: string; defter: string }[]> => db.sorgu(
  `SELECT malzeme_id AS "malzemeId", konum_id AS "konumId", parti_id AS "partiId", bakiye::text AS bakiye, defter::text AS defter FROM (${DEFTER_FARKI_SECIMI}) f`);

// ---- Emrin fişleri (3175 a) ---------------------------------------------------------------------------------------------------
// Emrin bütün hareketleri; tür asıl hareketten (geri almada geri alınan) okunur. Transfer, teslim kaydına bağlıysa teslimdir, değilse ambar
// transferidir. Emre bağlı olmayan hareket gelmez. Belge: malzeme fişi (SR, UG, FR, AF) ya da teslim numarası.
export interface EmirHareketiHam {
  id: number; zaman: string; tur: string; asilTur: string; cikisNedeni: string | null; girisKaynagi: string | null; malzemeId: number; miktar: string;
  partiId: number | null; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; partiEmirId: number | null;
  kaynakKonumKod: string | null; hedefKonumKod: string | null; isEmriId: number | null; akis: string | null; kisiId: number;
  malzemeFisiId: number | null; teslimNo: string | null;
}
export const emrinHareketleri = (db: Db, emirId: number): Promise<EmirHareketiHam[]> => db.sorgu(
  `SELECT h.id, ${zamanMetni('h.zaman')} AS zaman, h.tur, a.tur AS "asilTur", a.cikis_nedeni AS "cikisNedeni", a.giris_kaynagi AS "girisKaynagi",
     a.malzeme_id AS "malzemeId", h.miktar::text AS miktar, a.parti_id AS "partiId", p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo",
     p.dokum_no AS "dokumNo", p.uretim_emri_id AS "partiEmirId", kk.kod AS "kaynakKonumKod", hk.kod AS "hedefKonumKod", a.is_emri_id AS "isEmriId",
     (SELECT f.akis FROM stok_hareket_fisi_satiri hs JOIN stok_hareket_fisi f ON f.id = hs.fis_id WHERE hs.hareket_id = h.id) AS akis, h.kisi_id AS "kisiId",
     (SELECT l.fis_id FROM stok_malzeme_fisi_hareketi l WHERE l.hareket_id = h.id) AS "malzemeFisiId",
     (SELECT t.no FROM stok_teslim t WHERE t.hareket_id = a.id) AS "teslimNo"
   FROM stok_hareketi h
   JOIN stok_hareketi a ON a.id = COALESCE(h.geri_alinan_id, h.id)
   LEFT JOIN stok_parti p ON p.id = a.parti_id
   LEFT JOIN stok_konum kk ON kk.id = h.kaynak_konum_id LEFT JOIN stok_konum hk ON hk.id = h.hedef_konum_id
   WHERE a.uretim_emri_id = $1
     AND ((a.tur = 'giris' AND a.giris_kaynagi = 'uretim') OR (a.tur = 'cikis' AND a.cikis_nedeni IN ('uretime_sarf', 'fire')) OR a.tur = 'transfer')
   ORDER BY h.zaman DESC, h.id DESC`, [emirId]);

// 3175: emre ayrılmış (rezerve) miktar, malzeme başına (bütün statüler toplamı). Rezervesi olmayan malzeme satırsızdır.
export const emrinRezerveToplamlari = (db: Db, emirId: number): Promise<{ malzemeId: number; miktar: string }[]> => db.sorgu(
  `SELECT malzeme_id AS "malzemeId", sum(miktar)::text AS miktar FROM stok_rezerve WHERE uretim_emri_id = $1 GROUP BY malzeme_id ORDER BY malzeme_id`, [emirId]);
