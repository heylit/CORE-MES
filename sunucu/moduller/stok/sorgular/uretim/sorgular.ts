import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import type { KaliteDurumu } from '#paylasilan/sozlesme/stok.ts';
import type { SevkBakiyesi } from '../../kurallar.ts';
import { AYRILMIS_SQL, KULLANILABILIR_SQL } from '../ortak/sorgular.ts';

// ---- Üretim sayımının stoğa yansıması (kart #1289) ----------------------------------------------------------------------------
// İstasyon konumunda emrin partisindeki bakiyeler (satırı kilitlemez; değişim bakiyeyi kendisi kilitler) ve her satırdan yoldaki
// teslime ayrılan miktar. Yoldaki teslim bakiyeyi kaynakta bırakır; ayrılan kısım düzeltmeyle düşülemez.
// Emrin parçası kalite durumuyla taşınır: karar bekleyen ve red parça da üretimde ilerler (135).
export const istasyondakiEmirBakiyeleri = (db: Db, konumId: number, malzemeId: number, uretimEmriId: number): Promise<{ partiId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string; ayrilan: string }[]> =>
  db.sorgu(
    `SELECT b.parti_id AS "partiId", b.statu_id AS "statuId", b.kalite_durumu AS "kaliteDurumu", b.miktar::text AS miktar,
            COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id AND t.malzeme_id = b.malzeme_id
                        AND t.parti_id = b.parti_id AND t.statu_id IS NOT DISTINCT FROM b.statu_id AND t.kalite_durumu = b.kalite_durumu), 0)::text AS ayrilan
       FROM stok_bakiye b JOIN stok_parti p ON p.id = b.parti_id
      WHERE b.konum_id = $1 AND b.malzeme_id = $2 AND p.uretim_emri_id = $3 AND b.miktar > 0
      ORDER BY b.ilk_giris, b.parti_id`, [konumId, malzemeId, uretimEmriId]);
export const konumFirmasi = async (db: Db, konumId: number): Promise<number | null> =>
  (await db.tek<{ f: number | null }>('SELECT firma_id AS f FROM stok_konum WHERE id = $1', [konumId]))?.f ?? null;
// Konumda bir malzemenin tek statüdeki bakiyeleri (en eski önce); emir verilirse yalnız emrin partisi. Yolda teslime ayrılan ayrıca döner.
export const konumdakiParcaBakiyeleri = (db: Db, konumId: number, malzemeId: number, statuId: number | null, uretimEmriId: number | null): Promise<{ partiId: number | null; miktar: string; ayrilan: string }[]> =>
  db.sorgu(
    `SELECT b.parti_id AS "partiId", b.miktar::text AS miktar,
            COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id AND t.malzeme_id = b.malzeme_id
                        AND t.parti_id IS NOT DISTINCT FROM b.parti_id AND t.statu_id IS NOT DISTINCT FROM b.statu_id AND t.kalite_durumu = b.kalite_durumu), 0)::text AS ayrilan
       FROM stok_bakiye b LEFT JOIN stok_parti p ON p.id = b.parti_id
      WHERE b.konum_id = $1 AND b.malzeme_id = $2 AND b.statu_id IS NOT DISTINCT FROM $3 AND b.kalite_durumu = 'serbest' AND b.miktar > 0 AND ($4::bigint IS NULL OR p.uretim_emri_id = $4)
      ORDER BY b.ilk_giris, b.id`, [konumId, malzemeId, statuId, uretimEmriId]);
// Bu konumda emrin partisinde önceki statülerden hedef statüye net dönüşüm (geri dönüşler düşülmüş); düzeltme önce bunları geri çevirir.
export const netStatuDonusumleri = (db: Db, konumId: number, malzemeId: number, uretimEmriId: number, hedefStatuId: number | null): Promise<{ partiId: number; oncekiStatuId: number | null; miktar: string }[]> =>
  db.sorgu(
    `SELECT h.parti_id AS "partiId", CASE WHEN h.hedef_statu_id IS NOT DISTINCT FROM $4 THEN h.kaynak_statu_id ELSE h.hedef_statu_id END AS "oncekiStatuId",
            sum(CASE WHEN h.hedef_statu_id IS NOT DISTINCT FROM $4 THEN h.miktar ELSE -h.miktar END)::text AS miktar
       FROM stok_hareketi h JOIN stok_parti p ON p.id = h.parti_id
      WHERE h.tur = 'transfer' AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id) AND h.kaynak_konum_id = $1 AND h.hedef_konum_id = $1 AND h.malzeme_id = $2 AND p.uretim_emri_id = $3
        AND (h.hedef_statu_id IS NOT DISTINCT FROM $4) <> (h.kaynak_statu_id IS NOT DISTINCT FROM $4)
      GROUP BY 1, 2 HAVING sum(CASE WHEN h.hedef_statu_id IS NOT DISTINCT FROM $4 THEN h.miktar ELSE -h.miktar END) > 0
      ORDER BY 1, 2 NULLS FIRST`, [konumId, malzemeId, uretimEmriId, hedefStatuId]);
// Emrin bu konumdan teslim edilen miktarı: yoldaki gönderilen, alınan alınan kadar sayılır; red ve iptal sayılmaz.
export const konumdanTeslimEdilen = async (db: Db, konumId: number, uretimEmriId: number): Promise<string> =>
  (await db.tek<{ m: string }>(
    `SELECT COALESCE(sum(CASE WHEN t.durum = 'teslim' THEN t.alinan ELSE t.miktar END), 0)::text AS m
       FROM stok_teslim t JOIN stok_parti p ON p.id = t.parti_id
      WHERE t.kaynak_konum_id = $1 AND p.uretim_emri_id = $2 AND t.durum IN ('yolda', 'teslim')`, [konumId, uretimEmriId]))!.m;
// Konumda emrin partisine yazılmış, geri alınmamış üretim girişleri, yeniden eskiye (düzeltme en son girişten geri alır).
export const geriAlinmamisUretimGirisleri = (db: Db, konumId: number, partiId: number, statuId: number | null): Promise<{ id: number; miktar: string }[]> =>
  db.sorgu(
    `SELECT h.id, h.miktar::text AS miktar FROM stok_hareketi h
      WHERE h.tur = 'giris' AND h.giris_kaynagi = 'uretim' AND h.hedef_konum_id = $1 AND h.parti_id = $2 AND h.hedef_statu_id IS NOT DISTINCT FROM $3
        AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
      ORDER BY h.id DESC`, [konumId, partiId, statuId]);

// ---- Fason firma konumları (kart #1310) ---------------------------------------------------------------------------------
// Firmanın "Yolda" ve fason konumu firmadan kendiliğinden açılır; eşzamanlı ikinci açılış satır döndürmez, çağıran okur.
export const firmaKonumu = async (db: Db, firmaId: number, tur: 'yolda' | 'fason'): Promise<number | null> =>
  (await db.tek<{ id: number }>('SELECT id FROM stok_konum WHERE firma_id = $1 AND tur = $2', [firmaId, tur]))?.id ?? null;
export const firmaKonumuAc = async (db: Db, k: { depoId: number; kod: string; ad: string; firmaId: number; tur: 'yolda' | 'fason' }): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_konum (depo_id, kod, tur, ad, firma_id)
     SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (SELECT 1 FROM stok_konum WHERE kod = $2)
     ON CONFLICT ON CONSTRAINT stok_konum_firma_tek DO NOTHING RETURNING id`, [k.depoId, k.kod, k.tur, k.ad, k.firmaId]))?.id ?? null;
// Firma konumlarında (yolda ve fason) bakiyesi kalan emirler: fason işi kapanmış emrin kalanı "eksik" uyarısıdır.
export const firmadakiEmirler = (db: Db): Promise<{ uretimEmriId: number }[]> =>
  db.sorgu(`SELECT DISTINCT p.uretim_emri_id AS "uretimEmriId"
              FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id JOIN stok_parti p ON p.id = b.parti_id
             WHERE k.firma_id IS NOT NULL AND b.miktar > 0 AND p.uretim_emri_id IS NOT NULL`);

// ---- Ürün sevki (235 a) ----------------------------------------------------------------------------------------------------
// Emrin ürününün sevk edilebilecek bakiyeleri: firmaya bağlı (yolda, fason) ve hurda konumları dışında her yer. Önce sevkiyat
// alanı, sonra statüsüz (son hâl), sonra en eski giriş. Karantina ve karar bekleyen de döner: kural reddi ve iletiyi seçer.
export const emrinSevkBakiyeleri = (db: Db, malzemeId: number, uretimEmriId: number): Promise<SevkBakiyesi[]> =>
  db.sorgu(
    `SELECT b.konum_id AS "konumId", k.tur AS "konumTuru", b.parti_id AS "partiId", b.statu_id AS "statuId", b.kalite_durumu AS "kaliteDurumu",
            b.miktar::text AS miktar,
            COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id AND t.malzeme_id = b.malzeme_id
                        AND t.parti_id = b.parti_id AND t.statu_id IS NOT DISTINCT FROM b.statu_id AND t.kalite_durumu = b.kalite_durumu), 0)::text AS ayrilan
       FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id JOIN stok_parti p ON p.id = b.parti_id
      WHERE b.malzeme_id = $1 AND p.uretim_emri_id = $2 AND b.miktar > 0 AND k.firma_id IS NULL AND k.tur <> 'hurda'
      ORDER BY (k.tur = 'sevkiyat') DESC, (b.statu_id IS NULL) DESC, b.ilk_giris, b.parti_id, b.konum_id`, [malzemeId, uretimEmriId]);
// Sevkin geri alınmamış hareketleri (en yeniden): iş kimliği hareketin açıklamasındadır (red parçada ekiyle), geri alma bunlardan yazılır.
export const geriAlinmamisSevkHareketleri = async (db: Db, uretimEmriId: number, aciklama: string, ek: string): Promise<number[]> =>
  (await db.sorgu<{ id: number }>(
    `SELECT h.id FROM stok_hareketi h
      WHERE h.uretim_emri_id = $1 AND h.aciklama IN ($2, $2 || $3) AND h.tur IN ('transfer', 'cikis')
        AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
      ORDER BY h.id DESC`, [uretimEmriId, aciklama, ek])).map((r) => r.id);

// ---- Terminal üretim girişinin girdi tarafı ------------------------------------------------------------------------------
// Adımın girdisi önce istasyondan, sonra en eski girişten alınır. Statüsüz girdi depo konumlarından (başka istasyon, üretim çıkışı,
// fason, hurda ve yolda hariç; çıkış önerisiyle aynı); statülü girdi önceki adımın çıktısıdır, başka istasyonda, üretim çıkışında
// ya da (fasondan döndüyse) mal kabulde olabilir. Taşınan parça (önceki adımın çıktısı) statüsüz de olsa istasyonda, üretim çıkışında ya da depoda olabilir. Yoldaki teslime
// ayrılan miktar alınmaz.
// Kart #1413 (kullanıcı kararları K2 "Hayır", K3 "Uyarıyla izin"): başka emrin partisi hiç düşülmez; statülü girdi yalnız bu istasyonda
// (teslim edilmiş) ya da fasondan dönüp mal kabulde (#1407) aranır; statüsüz girdi önce istasyonda, yetmezse depoda. Başka istasyon yalnız "bulunduğu yer" gösteriminde listelenir.
// tumKalite: istasyondaki karar bekleyen ve red parça da girdidir (135, 138 a); depodaki yalnız serbest alınır.
export const uretimGirdiKaynaklari = (
  db: Db, malzemeId: number, statuId: number | null, istasyonKonumId: number, uretimEmriId: number | null, digerIstasyonlar = false, tumKalite = false,
): Promise<{ konumId: number; partiId: number | null; partiEmriId: number | null; kaliteDurumu: KaliteDurumu; serbest: string }[]> =>
  db.sorgu(
    `SELECT b.konum_id AS "konumId", b.parti_id AS "partiId", p.uretim_emri_id AS "partiEmriId", b.kalite_durumu AS "kaliteDurumu",
            (b.miktar - COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id AND t.malzeme_id = b.malzeme_id
                                  AND t.parti_id IS NOT DISTINCT FROM b.parti_id AND t.statu_id IS NOT DISTINCT FROM b.statu_id AND t.kalite_durumu = b.kalite_durumu), 0))::text AS serbest
       FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id LEFT JOIN stok_parti p ON p.id = b.parti_id
      WHERE b.malzeme_id = $1 AND b.statu_id IS NOT DISTINCT FROM $2 AND (b.kalite_durumu = 'serbest' OR ($6 AND b.konum_id = $3)) AND b.miktar > 0
        AND ($5::int IS NULL OR p.uretim_emri_id IS NULL OR p.uretim_emri_id = $5)
        AND (b.konum_id = $3 OR ($2::int IS NULL AND k.tur NOT IN ('istasyon', 'uretim_cikisi', 'fason', 'yolda', ${AYRILMIS_SQL}))
             OR ($2::int IS NOT NULL AND k.tur = 'kabul') OR ($4 AND k.tur IN ('istasyon', 'uretim_cikisi')))
      ORDER BY (b.konum_id = $3) DESC, (p.uretim_emri_id IS NOT NULL AND p.uretim_emri_id = $5) DESC, b.ilk_giris, b.id`,
    [malzemeId, statuId, istasyonKonumId, digerIstasyonlar, uretimEmriId, tumKalite]);
// Gözde bir partinin (lotsuzda lotsuz bakiyenin) red ve karar bekleyen toplamı, her statüde (16.1: eksi onayı kaliteyi aşmaz).
export const gozdekiKullanilamazKalite = (db: Db, malzemeId: number, konumId: number, partiId: number | null): Promise<{ kaliteDurumu: KaliteDurumu; miktar: string }[]> =>
  db.sorgu(
    `SELECT kalite_durumu AS "kaliteDurumu", sum(miktar)::text AS miktar FROM stok_bakiye
      WHERE malzeme_id = $1 AND konum_id = $2 AND parti_id IS NOT DISTINCT FROM $3 AND kalite_durumu IN ('red', 'karar_bekliyor') AND miktar > 0
      GROUP BY kalite_durumu ORDER BY kalite_durumu`, [malzemeId, konumId, partiId]);
// İstasyonun konumu, yalnız konumda serbest olmayan (red, karar bekleyen) bakiye varsa (135 uyarısının ön denetimi): sayım yolunda her satırda
// koşar; konumu olan ama kalite bekleyen parçası olmayan istasyonda emir ve adım okunmaz (2902: istasyon konumu artık baştan açık).
export const kaliteBekleyenIstasyonKonumu = async (db: Db, istasyonId: number): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `SELECT k.id FROM stok_konum k WHERE k.istasyon_id = $1
       AND EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.konum_id = k.id AND b.kalite_durumu <> 'serbest' AND b.miktar > 0)`, [istasyonId]))?.id ?? null;
// Konumda bir parçanın serbest olmayan kalite durumlarındaki toplamı (üretimde uyarı, 135).
export const konumKaliteToplamlari = (db: Db, konumId: number, malzemeId: number, statuId: number | null): Promise<{ kaliteDurumu: KaliteDurumu; miktar: string }[]> =>
  db.sorgu(
    `SELECT kalite_durumu AS "kaliteDurumu", sum(miktar)::text AS miktar FROM stok_bakiye
      WHERE konum_id = $1 AND malzeme_id = $2 AND statu_id IS NOT DISTINCT FROM $3 AND kalite_durumu <> 'serbest' AND miktar > 0
      GROUP BY kalite_durumu ORDER BY kalite_durumu`, [konumId, malzemeId, statuId]);
// Bir kalite durumundaki bakiye her konumda (kalite kararı, 131 b): emrin partisi önce, sonra en eski giriş. Yoldaki teslime ayrılan düşülür.
export const kaliteBakiyeleri = (db: Db, malzemeId: number, statuId: number | null, kalite: KaliteDurumu, uretimEmriId: number): Promise<{ konumId: number; partiId: number | null; serbest: string }[]> =>
  db.sorgu(
    `SELECT b.konum_id AS "konumId", b.parti_id AS "partiId",
            (b.miktar - COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id AND t.malzeme_id = b.malzeme_id
                                  AND t.parti_id IS NOT DISTINCT FROM b.parti_id AND t.statu_id IS NOT DISTINCT FROM b.statu_id AND t.kalite_durumu = b.kalite_durumu), 0))::text AS serbest
       FROM stok_bakiye b LEFT JOIN stok_parti p ON p.id = b.parti_id
      WHERE b.malzeme_id = $1 AND b.statu_id IS NOT DISTINCT FROM $2 AND b.kalite_durumu = $3 AND b.miktar > 0
      ORDER BY (p.uretim_emri_id IS NOT NULL AND p.uretim_emri_id = $4) DESC, b.ilk_giris, b.id`,
    [malzemeId, statuId, kalite, uretimEmriId]);
// Onaylı kapanışın stok maddesi (1214 O-5): emrin onaylı eksi düşümünün yazıldığı, o malzeme ve statüde toplamı hâlâ eksi duran istasyon.
// Toplam bütün partilerin ve kalitelerin toplamıdır: lotlu parça sonradan teslim edilince lotsuz eksi satır kalsa da toplam kapanır.
// Statülüde aynı statünün başka istasyonlardaki artı bakiyesi (teslim edilmemiş parçanın muhtemel yeri) birlikte döner.
export const emrinIstasyonEksileri = (db: Db, uretimEmriId: number): Promise<{ konumKod: string; malzemeId: number; statuId: number | null; miktar: string; karsiliklar: { konumKod: string; miktar: string }[] }[]> =>
  db.sorgu(
    `WITH yer AS (
       SELECT DISTINCT h.kaynak_konum_id AS konum_id, h.malzeme_id, h.kaynak_statu_id AS statu_id FROM stok_hareketi h JOIN stok_konum k ON k.id = h.kaynak_konum_id
        WHERE h.uretim_emri_id = $1 AND h.onayli_eksi AND h.parti_id IS NULL AND k.tur = 'istasyon'),
     net AS (
       SELECT y.konum_id, y.malzeme_id, y.statu_id, sum(b.miktar) AS miktar FROM yer y
         JOIN stok_bakiye b ON b.konum_id = y.konum_id AND b.malzeme_id = y.malzeme_id AND b.statu_id IS NOT DISTINCT FROM y.statu_id
        GROUP BY y.konum_id, y.malzeme_id, y.statu_id HAVING sum(b.miktar) < 0)
     SELECT k.kod AS "konumKod", n.malzeme_id AS "malzemeId", n.statu_id AS "statuId", n.miktar::text AS miktar,
            CASE WHEN n.statu_id IS NULL THEN '[]'::json ELSE COALESCE((
              SELECT json_agg(json_build_object('konumKod', kk.kod, 'miktar', a.miktar::text) ORDER BY kk.kod)
                FROM (SELECT d.konum_id, sum(d.miktar) AS miktar FROM stok_bakiye d
                       WHERE d.malzeme_id = n.malzeme_id AND d.statu_id = n.statu_id AND d.konum_id <> n.konum_id GROUP BY d.konum_id HAVING sum(d.miktar) > 0) a
                JOIN stok_konum kk ON kk.id = a.konum_id WHERE kk.tur = 'istasyon'), '[]'::json) END AS karsiliklar
       FROM net n JOIN stok_konum k ON k.id = n.konum_id
      ORDER BY k.kod, n.malzeme_id, n.statu_id`, [uretimEmriId]);
// K-2 a (1386): emrin istasyonda kalan artı bakiyesi. Bakiye emre etiketli değildir; emre ait kısım, istasyon konumunda emrin hareketleriyle
// giren eksi çıkandır (malzeme, parti, statü ve kalite başına), o yerin bakiyesiyle sınırlı. Emirsiz taşıma ya da çıkışla bakiye boşalırsa madde kapanır.
export const emrinIstasyonArtilari = (db: Db, uretimEmriId: number): Promise<{ konumKod: string; malzemeId: number; statuId: number | null; miktar: string }[]> =>
  db.sorgu(
    `WITH akis AS (
       SELECT h.hedef_konum_id AS konum_id, h.malzeme_id, h.parti_id, h.hedef_statu_id AS statu_id, COALESCE(h.hedef_kalite_durumu, 'serbest') AS kalite, h.miktar
         FROM stok_hareketi h WHERE h.uretim_emri_id = $1 AND h.hedef_konum_id IS NOT NULL
       UNION ALL
       SELECT h.kaynak_konum_id, h.malzeme_id, h.parti_id, h.kaynak_statu_id, COALESCE(h.kaynak_kalite_durumu, 'serbest'), -h.miktar
         FROM stok_hareketi h WHERE h.uretim_emri_id = $1 AND h.kaynak_konum_id IS NOT NULL),
     net AS (
       SELECT a.konum_id, a.malzeme_id, a.parti_id, a.statu_id, a.kalite, sum(a.miktar) AS miktar
         FROM akis a JOIN stok_konum k ON k.id = a.konum_id WHERE k.tur = 'istasyon'
        GROUP BY a.konum_id, a.malzeme_id, a.parti_id, a.statu_id, a.kalite HAVING sum(a.miktar) > 0),
     kalan AS (
       SELECT n.konum_id, n.malzeme_id, n.statu_id, LEAST(n.miktar, COALESCE((
                SELECT sum(b.miktar) FROM stok_bakiye b WHERE b.konum_id = n.konum_id AND b.malzeme_id = n.malzeme_id AND b.parti_id IS NOT DISTINCT FROM n.parti_id
                   AND b.statu_id IS NOT DISTINCT FROM n.statu_id AND b.kalite_durumu = n.kalite), 0)) AS miktar
         FROM net n)
     SELECT k.kod AS "konumKod", x.malzeme_id AS "malzemeId", x.statu_id AS "statuId", sum(x.miktar)::text AS miktar
       FROM kalan x JOIN stok_konum k ON k.id = x.konum_id WHERE x.miktar > 0
      GROUP BY k.kod, x.malzeme_id, x.statu_id ORDER BY k.kod, x.malzeme_id, x.statu_id NULLS FIRST`, [uretimEmriId]);
// Sayım düşünce geri çevrilecek parçanın eski kalitesi (1214 O-1): emrin bu istasyonda kaynak statüden adım statüsüne çevirdiği hareketler
// (en yenisi önce) ve o kaliteden geri çevrilen toplam. Geri çevirme en yenisinden düştüğü için önceki geri çevirmeler en yenilerden düşülür.
export async function emrinStatuCevirmeleri(
  db: Db, a: { uretimEmriId: number; malzemeId: number; konumId: number; partiId: number | null; kaynakStatuId: number | null; hedefStatuId: number | null; hedefKalite: KaliteDurumu },
): Promise<{ ileri: { miktar: string; kaynakKalite: KaliteDurumu }[]; geriCevrilen: string }> {
  const p = [a.uretimEmriId, a.malzemeId, a.konumId, a.partiId, a.kaynakStatuId, a.hedefStatuId, a.hedefKalite];
  const kosul = `h.tur = 'transfer' AND h.uretim_emri_id = $1 AND h.malzeme_id = $2 AND h.kaynak_konum_id = $3 AND h.hedef_konum_id = $3
    AND h.parti_id IS NOT DISTINCT FROM $4`;
  const ileri = await db.sorgu<{ miktar: string; kaynakKalite: KaliteDurumu }>(
    `SELECT h.miktar::text AS miktar, COALESCE(h.kaynak_kalite_durumu, 'serbest') AS "kaynakKalite" FROM stok_hareketi h
      WHERE ${kosul} AND h.kaynak_statu_id IS NOT DISTINCT FROM $5::int AND h.hedef_statu_id IS NOT DISTINCT FROM $6::int AND COALESCE(h.hedef_kalite_durumu, 'serbest') = $7
      ORDER BY h.id DESC`, p);
  const geri = await db.tek<{ m: string }>(
    `SELECT COALESCE(sum(h.miktar), 0)::text AS m FROM stok_hareketi h
      WHERE ${kosul} AND h.kaynak_statu_id IS NOT DISTINCT FROM $6::int AND h.hedef_statu_id IS NOT DISTINCT FROM $5::int AND COALESCE(h.kaynak_kalite_durumu, 'serbest') = $7`, p);
  return { ileri, geriCevrilen: geri!.m };
}
// Emre yazılmış, geri alınmamış üretime sarflar (en yenisi önce): sayım düşünce sarf bunlardan geri alınır.
// Elle sarf (iş emirsiz) sayımla geri alınmaz (denetim #1): sayım onu düşmemiştir.
export const geriAlinmamisSarflar = (db: Db, uretimEmriId: number, malzemeId: number): Promise<{ id: number; miktar: string; konumId: number; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu }[]> =>
  db.sorgu(
    `SELECT h.id, h.miktar::text AS miktar, h.kaynak_konum_id AS "konumId", h.parti_id AS "partiId", h.kaynak_statu_id AS "statuId",
            COALESCE(h.kaynak_kalite_durumu, 'serbest') AS "kaliteDurumu" FROM stok_hareketi h
      WHERE h.tur = 'cikis' AND h.cikis_nedeni = 'uretime_sarf' AND h.uretim_emri_id = $1 AND h.malzeme_id = $2 AND h.is_emri_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
      ORDER BY h.id DESC`, [uretimEmriId, malzemeId]);
// Emrin statüsüz girdisinin geri alınmamış üretime sarfı: hepsi ve yalnız elle yazılanı (iş emirsiz).
export const emrinStatusuzSarfi = async (db: Db, uretimEmriId: number, malzemeId: number): Promise<{ net: string; elle: string }> =>
  (await db.tek<{ net: string; elle: string }>(
    `SELECT COALESCE(sum(h.miktar), 0)::text AS net, COALESCE(sum(h.miktar) FILTER (WHERE h.is_emri_id IS NULL), 0)::text AS elle
       FROM stok_hareketi h
      WHERE h.tur = 'cikis' AND h.cikis_nedeni = 'uretime_sarf' AND h.uretim_emri_id = $1 AND h.malzeme_id = $2 AND h.kaynak_statu_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)`, [uretimEmriId, malzemeId]))!;
// Terminal hurdasının geri alınmamış fire çıkışları (en yenisi önce): hurda geri alınınca bunlar geri alınır. Fason fire'ı başka konumdadır.
export const geriAlinmamisHurdaCikislari = (db: Db, uretimEmriId: number, malzemeId: number, konumId: number, aciklamaOnEki: string): Promise<{ id: number; miktar: string; konumId: number; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu }[]> =>
  db.sorgu(
    `SELECT h.id, h.miktar::text AS miktar, h.kaynak_konum_id AS "konumId", h.parti_id AS "partiId", h.kaynak_statu_id AS "statuId",
            COALESCE(h.kaynak_kalite_durumu, 'serbest') AS "kaliteDurumu" FROM stok_hareketi h
      WHERE h.tur = 'cikis' AND h.cikis_nedeni = 'fire' AND h.uretim_emri_id = $1 AND h.malzeme_id = $2 AND h.kaynak_konum_id = $3 AND starts_with(h.aciklama, $4)
        AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
      ORDER BY h.id DESC`, [uretimEmriId, malzemeId, konumId, aciklamaOnEki]);

/* ---------------- Statülü malzemenin emre ayrılması (rezerve) ---------------- */

export interface RezerveSatiri { malzemeId: number; statuId: number | null; uretimEmriId: number; miktar: string }

// Aynı malzemenin ayırma ve kaldırmaları sıraya girer: ikinci istek ilk işlem bitince ayrılmamış miktarı yeniden okur.
export const rezerveKilidi = async (db: Db, malzemeId: number): Promise<void> => {
  await islemKilidiAl(db, 'stok_rezerve', malzemeId);
};
export const rezerveArtir = (db: Db, r: { malzemeId: number; statuId: number | null; uretimEmriId: number; miktar: string }): Promise<unknown> => db.sorgu(
  `INSERT INTO stok_rezerve (malzeme_id, statu_id, uretim_emri_id, miktar) VALUES ($1, $2, $3, $4)
   ON CONFLICT (malzeme_id, (coalesce(statu_id, 0)), uretim_emri_id) DO UPDATE SET miktar = stok_rezerve.miktar + EXCLUDED.miktar`,
  [r.malzemeId, r.statuId, r.uretimEmriId, r.miktar]);

// Ayrılanı en çok kendisi kadar azaltır; sıfırlanan satır silinir. Döner: düşülen miktar.
export async function rezerveAzalt(db: Db, r: { malzemeId: number; statuId: number | null; uretimEmriId: number; miktar: string }): Promise<string> {
  const silinen = await db.tek<{ miktar: string }>(
    `DELETE FROM stok_rezerve WHERE malzeme_id = $1 AND statu_id IS NOT DISTINCT FROM $2::int AND uretim_emri_id = $3 AND miktar <= $4 RETURNING miktar::text`,
    [r.malzemeId, r.statuId, r.uretimEmriId, r.miktar]);
  if (silinen) return silinen.miktar;
  const kalan = await db.tek<{ miktar: string }>(
    `UPDATE stok_rezerve SET miktar = miktar - $4 WHERE malzeme_id = $1 AND statu_id IS NOT DISTINCT FROM $2::int AND uretim_emri_id = $3 RETURNING $4::numeric::text AS miktar`,
    [r.malzemeId, r.statuId, r.uretimEmriId, r.miktar]);
  return kalan?.miktar ?? '0';
}

export const rezerveler = (db: Db, malzemeIdler: readonly number[]): Promise<RezerveSatiri[]> => db.sorgu(
  `SELECT malzeme_id AS "malzemeId", statu_id AS "statuId", uretim_emri_id AS "uretimEmriId", miktar::text AS miktar
     FROM stok_rezerve WHERE malzeme_id = ANY($1::int[]) ORDER BY malzeme_id, statu_id, uretim_emri_id`, [malzemeIdler]);

export const tumRezerveler = (db: Db): Promise<RezerveSatiri[]> => db.sorgu(
  `SELECT malzeme_id AS "malzemeId", statu_id AS "statuId", uretim_emri_id AS "uretimEmriId", miktar::text AS miktar
     FROM stok_rezerve ORDER BY malzeme_id, statu_id, uretim_emri_id`);

// Statüsüz (serbest) toplamda ayrılmış yer (hurda, karantina, sevkiyat) sayılmaz: oradaki stok kimseye ayrılamaz.
export const statuToplami = async (db: Db, malzemeId: number, statuId: number | null): Promise<string> => (await db.tek<{ miktar: string }>(
  `SELECT coalesce(sum(b.miktar), 0)::text AS miktar FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
    WHERE b.malzeme_id = $1 AND b.statu_id IS NOT DISTINCT FROM $2::int AND b.${KULLANILABILIR_SQL} AND ($2::int IS NOT NULL OR k.tur NOT IN (${AYRILMIS_SQL}))`,
  [malzemeId, statuId]))!.miktar;

// Kapanan emrin ayrılanları ve bekleme isteği silinir: kapalı emre ayrılmış miktar kalmaz. Döner: silinen ayrılanlar (kayıt için).
export async function emrinRezerveleriniSil(db: Db, uretimEmriId: number): Promise<RezerveSatiri[]> {
  await db.sorgu('DELETE FROM stok_emir_rezerve_istegi WHERE uretim_emri_id = $1', [uretimEmriId]);
  return db.sorgu<RezerveSatiri>(
    `DELETE FROM stok_rezerve WHERE uretim_emri_id = $1
     RETURNING malzeme_id AS "malzemeId", statu_id AS "statuId", uretim_emri_id AS "uretimEmriId", miktar::text AS miktar`, [uretimEmriId]);
}

export const emirRezerveIstegiYaz = (db: Db, uretimEmriId: number, kisiId: number): Promise<unknown> => db.sorgu(
  'INSERT INTO stok_emir_rezerve_istegi (uretim_emri_id, kisi_id) VALUES ($1, $2) ON CONFLICT (uretim_emri_id) DO NOTHING', [uretimEmriId, kisiId]);
export const rezerveIsteyenEmirler = async (db: Db): Promise<number[]> =>
  (await db.sorgu<{ id: number }>('SELECT uretim_emri_id AS id FROM stok_emir_rezerve_istegi ORDER BY uretim_emri_id')).map((x) => x.id);
// Emrin malzemeden net sarfı (çıkışlar eksi geri alınanlar): karşılanmış ihtiyaçtır, yeniden ayrılmaz.
export const emrinNetSarfi = async (db: Db, uretimEmriId: number, malzemeId: number): Promise<string> => (await db.tek<{ miktar: string }>(
  `SELECT coalesce(sum(CASE WHEN h.tur = 'cikis' THEN h.miktar ELSE -h.miktar END), 0)::text AS miktar FROM stok_hareketi h
    WHERE h.uretim_emri_id = $1 AND h.malzeme_id = $2
      AND (h.cikis_nedeni = 'uretime_sarf' OR (h.tur = 'geri_alma' AND h.hedef_konum_id IS NOT NULL AND h.kaynak_konum_id IS NULL))`, [uretimEmriId, malzemeId]))!.miktar;

export const rezerveKaydiYaz = (db: Db, k: { malzemeId: number; statuId: number | null; uretimEmriId: number; tur: 'ayir' | 'kaldir'; miktar: string; neden: string | null; kisiId: number }): Promise<unknown> => db.sorgu(
  `INSERT INTO stok_rezerve_kaydi (malzeme_id, statu_id, uretim_emri_id, tur, miktar, neden, kisi_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  [k.malzemeId, k.statuId, k.uretimEmriId, k.tur, k.miktar, k.neden, k.kisiId]);

// Fason gönderimiyle firmanın "Yolda" konumuna giren toplam (emrin bu kartı); geri alma ve dönüş bu toplama girmez.
export const fasonaTasinan = async (db: Db, uretimEmriId: number, malzemeId: number, yoldaKonumId: number): Promise<string> =>
  (await db.tek<{ m: string }>(
    `SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_hareketi
      WHERE tur = 'transfer' AND uretim_emri_id = $1 AND malzeme_id = $2 AND hedef_konum_id = $3 AND aciklama LIKE 'Fason gönderimi%'`,
    [uretimEmriId, malzemeId, yoldaKonumId]))?.m ?? '0';
// 1868: Teslim al'daki iş malzemeleri istasyondaki her adım ve girdi için ayrı okuyordu (terminal dakikada bir çağırır). Aşağıdaki iki
// okuma uretimGirdiKaynaklari ve istekleriKoktan'ın toplu biçimidir: kural ve sıra aynıdır, istek tek sorgudur.
export interface GirdiKaynagiAnahtari { malzemeId: number; statuId: number | null; uretimEmriId: number | null }
export const uretimGirdiKaynaklariToplu = async (
  db: Db, anahtarlar: readonly GirdiKaynagiAnahtari[], istasyonKonumId: number, digerIstasyonlar = false,
): Promise<{ konumId: number; partiId: number | null; partiEmriId: number | null; kaliteDurumu: KaliteDurumu; serbest: string }[][]> => {
  if (anahtarlar.length === 0) return [];
  const satirlar = await db.sorgu<{ sira: number; konumId: number; partiId: number | null; partiEmriId: number | null; kaliteDurumu: KaliteDurumu; serbest: string }>(
    `SELECT c.sira::int AS sira, x.* FROM unnest($1::int[], $2::int[], $3::int[]) WITH ORDINALITY AS c(malzeme_id, statu_id, emir_id, sira)
       CROSS JOIN LATERAL (
         SELECT b.konum_id AS "konumId", b.parti_id AS "partiId", p.uretim_emri_id AS "partiEmriId", b.kalite_durumu AS "kaliteDurumu",
                (b.miktar - COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id AND t.malzeme_id = b.malzeme_id
                                      AND t.parti_id IS NOT DISTINCT FROM b.parti_id AND t.statu_id IS NOT DISTINCT FROM b.statu_id AND t.kalite_durumu = b.kalite_durumu), 0))::text AS serbest
           FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id LEFT JOIN stok_parti p ON p.id = b.parti_id
          WHERE b.malzeme_id = c.malzeme_id AND b.statu_id IS NOT DISTINCT FROM c.statu_id AND b.kalite_durumu = 'serbest' AND b.miktar > 0
            AND (c.emir_id IS NULL OR p.uretim_emri_id IS NULL OR p.uretim_emri_id = c.emir_id)
            AND (b.konum_id = $4 OR (c.statu_id IS NULL AND k.tur NOT IN ('istasyon', 'uretim_cikisi', 'fason', 'yolda', ${AYRILMIS_SQL}))
                 OR (c.statu_id IS NOT NULL AND k.tur = 'kabul') OR ($5 AND k.tur IN ('istasyon', 'uretim_cikisi')))
          ORDER BY (b.konum_id = $4) DESC, (p.uretim_emri_id IS NOT NULL AND p.uretim_emri_id = c.emir_id) DESC, b.ilk_giris, b.id) x
      ORDER BY c.sira`,
    [anahtarlar.map((a) => a.malzemeId), anahtarlar.map((a) => a.statuId), anahtarlar.map((a) => a.uretimEmriId), istasyonKonumId, digerIstasyonlar]);
  const l = anahtarlar.map((): { konumId: number; partiId: number | null; partiEmriId: number | null; kaliteDurumu: KaliteDurumu; serbest: string }[] => []);
  for (const { sira, ...x } of satirlar) l[sira - 1]!.push(x);
  return l;
};
