import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { KaliteDurumu, KonumTuru } from '#paylasilan/sozlesme/stok.ts';
import { AYRILMIS_SQL, TESLIM_SECIMI } from '../ortak/sorgular.ts';
import type { TeslimHam } from '../teslim/sorgular.ts';

// ---- Refakat partisi (kart #123): emir + depodan verilen lot ------------------------------------------------------------
export interface RefakatPartisiHam {
  id: number; uretimEmriId: number; sira: number; malzemeId: number; partiId: number | null; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null;
  durum: 'acik' | 'iptal'; surum: number; kayitZamani: string; verilen: string;
  ustRefakatPartisiId: number | null; birlestigiRefakatPartisiId: number | null; birlesmeZamani: string | null; lotaBaglanmaZamani: string | null;
}
// Verilen (Soru 137 a): partinin emrine o lottan depo konumlarından üretim tarafına yapılan teslimler eksi depoya dönenler; istasyonlar
// arası teslim yeniden sayılmaz. Alınan teslimde alınan, yoldakinde gönderilen miktar.
const REFAKAT_SECIMI = `SELECT r.id, r.uretim_emri_id AS "uretimEmriId", r.sira, r.malzeme_id AS "malzemeId", r.parti_id AS "partiId", p.lot_no AS "lotNo",
  p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.sertifika_no AS "sertifikaNo", r.durum, r.surum, ${zamanMetni('r.kayit_zamani')} AS "kayitZamani",
  r.ust_refakat_partisi_id AS "ustRefakatPartisiId", r.birlestigi_refakat_partisi_id AS "birlestigiRefakatPartisiId", ${zamanMetni('r.birlesme_zamani')} AS "birlesmeZamani",
  ${zamanMetni('r.lota_baglanma_zamani')} AS "lotaBaglanmaZamani",
  (SELECT COALESCE(sum((CASE WHEN tk.tur IN ('raf_gozu', 'kabul', 'depo_zemini') THEN 1 ELSE 0 END - CASE WHEN th.tur IN ('raf_gozu', 'kabul', 'depo_zemini') THEN 1 ELSE 0 END)
      * CASE t.durum WHEN 'teslim' THEN t.alinan ELSE t.miktar END), 0)
     FROM stok_teslim t JOIN stok_konum tk ON tk.id = t.kaynak_konum_id JOIN stok_konum th ON th.id = t.hedef_konum_id
    WHERE t.uretim_emri_id = r.uretim_emri_id AND t.parti_id = r.parti_id AND t.durum IN ('yolda', 'teslim'))::text AS verilen
  FROM stok_refakat_partisi r LEFT JOIN stok_parti p ON p.id = r.parti_id`;
export const refakatPartisiBul = (db: Db, id: number, kilit = false): Promise<RefakatPartisiHam | null> =>
  db.tek(`${REFAKAT_SECIMI} WHERE r.id = $1${kilit ? ' FOR UPDATE OF r' : ''}`, [id]);
export const refakatPartileriBul = (db: Db, idler: readonly number[]): Promise<RefakatPartisiHam[]> =>
  db.sorgu(`${REFAKAT_SECIMI} WHERE r.id = ANY($1::int[]) ORDER BY r.id`, [idler]);
export const acikRefakatPartisi = (db: Db, uretimEmriId: number, partiId: number): Promise<RefakatPartisiHam | null> =>
  db.tek(`${REFAKAT_SECIMI} WHERE r.uretim_emri_id = $1 AND r.parti_id = $2 AND r.durum = 'acik'`, [uretimEmriId, partiId]);
// Refakat kartları sayfası (kart #708): en yeni kart önce; iptal kart yalnız istenince.
export const refakatKartlariListe = (db: Db, iptalDahil: boolean, sinir: number): Promise<RefakatPartisiHam[]> =>
  db.sorgu(`${REFAKAT_SECIMI} WHERE ($1 OR r.durum = 'acik') ORDER BY r.kayit_zamani DESC, r.id DESC LIMIT $2`, [iptalDahil, sinir]);
export const emrinRefakatPartileri = (db: Db, uretimEmriId: number): Promise<RefakatPartisiHam[]> =>
  db.sorgu(`${REFAKAT_SECIMI} WHERE r.uretim_emri_id = $1 ORDER BY r.sira`, [uretimEmriId]);
// İstasyonda satırı olan kartlar: kartın lotu ya da kartla sayılmış üretim partisi istasyonun konumunda artı bakiyede.
export const istasyondaSatiriOlanKartlar = async (db: Db, kartIdler: readonly number[], istasyonId: number): Promise<Set<number>> =>
  new Set((await db.sorgu<{ id: number }>(
    `SELECT DISTINCT r.id FROM stok_refakat_partisi r
       JOIN stok_bakiye b ON b.miktar > 0 AND (b.parti_id = r.parti_id OR b.parti_id IN (SELECT p.id FROM stok_parti p WHERE p.refakat_partisi_id = r.id))
       JOIN stok_konum k ON k.id = b.konum_id AND k.istasyon_id = $2
      WHERE r.id = ANY($1::int[])`, [kartIdler, istasyonId])).map((x) => x.id));
// Sıra emir başına artar; aynı emre eşzamanlı iki açılış sırayla girer (kilit işlem sonunda bırakılır).
export const refakatPartisiAc = async (db: Db, r: { uretimEmriId: number; malzemeId: number; partiId: number; kisiId: number; ustRefakatPartisiId?: number | null }): Promise<number | null> => {
  await islemKilidiAl(db, 'stok_refakat_partisi', r.uretimEmriId);
  return (await db.tek<{ id: number }>(
    `INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id, ust_refakat_partisi_id)
     SELECT $1, COALESCE(max(sira), 0) + 1, $2, $3, $4, $5 FROM stok_refakat_partisi WHERE uretim_emri_id = $1
     ON CONFLICT (uretim_emri_id, parti_id) WHERE durum = 'acik' DO NOTHING RETURNING id`,
    [r.uretimEmriId, r.malzemeId, r.partiId, r.kisiId, r.ustRefakatPartisiId ?? null]))?.id ?? null;
};
// Birleşen kartın okutulması birleştiği karta yönlenir (kart #126); zincir derinliği sınırlıdır, döngü sonsuz yürümez.
export const etkinRefakatPartisiBul = async (db: Db, id: number): Promise<RefakatPartisiHam | null> => {
  const son = await db.tek<{ id: number }>(
    `WITH RECURSIVE z(id, sonraki, derinlik) AS (
       SELECT id, birlestigi_refakat_partisi_id, 0 FROM stok_refakat_partisi WHERE id = $1
       UNION ALL SELECT r.id, r.birlestigi_refakat_partisi_id, z.derinlik + 1 FROM z JOIN stok_refakat_partisi r ON r.id = z.sonraki WHERE z.derinlik < 20)
     SELECT id FROM z ORDER BY derinlik DESC LIMIT 1`, [id]);
  return son === null ? null : refakatPartisiBul(db, son.id);
};
export const refakatBirlestir = (db: Db, id: number, hedefId: number): Promise<{ id: number } | null> =>
  db.tek(
    `UPDATE stok_refakat_partisi SET birlestigi_refakat_partisi_id = $2, birlesme_zamani = now(), surum = surum + 1
      WHERE id = $1 AND birlestigi_refakat_partisi_id IS NULL RETURNING id`, [id, hedefId]);
export const altRefakatPartileri = (db: Db, id: number): Promise<RefakatPartisiHam[]> =>
  db.sorgu(`${REFAKAT_SECIMI} WHERE r.ust_refakat_partisi_id = $1 ORDER BY r.id`, [id]);
export const birlesenRefakatPartileri = (db: Db, id: number): Promise<RefakatPartisiHam[]> =>
  db.sorgu(`${REFAKAT_SECIMI} WHERE r.birlestigi_refakat_partisi_id = $1 ORDER BY r.id`, [id]);
export const lotunRefakatPartileri = (db: Db, partiId: number): Promise<RefakatPartisiHam[]> =>
  db.sorgu(`${REFAKAT_SECIMI} WHERE r.parti_id = $1 ORDER BY r.id`, [partiId]);
// Kartın soyu: kendisi, üst kartları ve ona (dolaylı) birleşen kartlar. Kartla sayımda malzeme önce bu kartların lot ve çıktılarından seçilir.
export const refakatSoyu = async (db: Db, id: number): Promise<number[]> =>
  (await db.sorgu<{ id: number }>(
    `WITH RECURSIVE ust(id, derinlik) AS (
       SELECT id, 0 FROM stok_refakat_partisi WHERE id = $1
       UNION ALL SELECT r.ust_refakat_partisi_id, u.derinlik + 1 FROM ust u JOIN stok_refakat_partisi r ON r.id = u.id
        WHERE r.ust_refakat_partisi_id IS NOT NULL AND u.derinlik < 20),
     gelen(id, derinlik) AS (
       SELECT id, 0 FROM stok_refakat_partisi WHERE id = $1
       UNION ALL SELECT r.id, g.derinlik + 1 FROM gelen g JOIN stok_refakat_partisi r ON r.birlestigi_refakat_partisi_id = g.id WHERE g.derinlik < 20)
     SELECT id FROM ust UNION SELECT id FROM gelen`, [id])).map((r) => r.id);
// Lotun kartları (lot izi): lotu taşıyan kartlar, parti üretim partisiyse onu üreten kart, bunların alt (kol) kartları ve bunlara
// (dolaylı) birleşenler. Lota bağlanırken başka karta birleşen istisna kartı lotu almaz; birleşme bağıyla gelir.
export const lotunKartlari = async (db: Db, partiId: number): Promise<number[]> =>
  (await db.sorgu<{ id: number }>(
    `WITH RECURSIVE k(id, derinlik) AS (
       SELECT r.id, 0 FROM stok_refakat_partisi r
        WHERE r.parti_id = $1 OR r.id = (SELECT p.refakat_partisi_id FROM stok_parti p WHERE p.id = $1)
       UNION SELECT r.id, k.derinlik + 1 FROM k JOIN stok_refakat_partisi r ON r.ust_refakat_partisi_id = k.id OR r.birlestigi_refakat_partisi_id = k.id
        WHERE k.derinlik < 20)
     SELECT DISTINCT id FROM k ORDER BY id`, [partiId])).map((r) => r.id);
export interface RefakatCiktisiHam { partiId: number; lotNo: string; malzemeId: number; refakatPartisiId: number; eldeki: string }
// Kartlarla sayılan üretim partileri ve bugün elde kalanı (bütün konumlar; kalite durumu ayrılmaz).
export const refakatCiktilari = (db: Db, kartlar: readonly number[]): Promise<RefakatCiktisiHam[]> =>
  db.sorgu(
    `SELECT p.id AS "partiId", p.lot_no AS "lotNo", p.malzeme_id AS "malzemeId", p.refakat_partisi_id AS "refakatPartisiId",
            COALESCE((SELECT sum(b.miktar) FROM stok_bakiye b WHERE b.parti_id = p.id), 0)::text AS eldeki
       FROM stok_parti p WHERE p.refakat_partisi_id = ANY($1::int[]) ORDER BY p.id`, [kartlar]);
export interface RefakatSevkiHam { hareketId: number; zaman: string; malzemeId: number; partiId: number; lotNo: string; miktar: string; uretimEmriId: number | null; aciklama: string | null }
// Kartların üretim partilerinden yapılmış, geri alınmamış sevk çıkışları.
export const refakatSevkleri = (db: Db, kartlar: readonly number[]): Promise<RefakatSevkiHam[]> =>
  db.sorgu(
    `SELECT h.id AS "hareketId", ${zamanMetni('h.zaman')} AS zaman, h.malzeme_id AS "malzemeId", h.parti_id AS "partiId", p.lot_no AS "lotNo", h.miktar::text AS miktar,
            h.uretim_emri_id AS "uretimEmriId", h.aciklama
       FROM stok_hareketi h JOIN stok_parti p ON p.id = h.parti_id
      WHERE p.refakat_partisi_id = ANY($1::int[]) AND h.tur = 'cikis' AND h.cikis_nedeni = 'sevk'
        AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
      ORDER BY h.zaman, h.id`, [kartlar]);
export const refakatPartisiIptal = (db: Db, id: number, surum: number, kisiId: number): Promise<{ id: number } | null> =>
  db.tek(
    `UPDATE stok_refakat_partisi SET durum = 'iptal', iptal_eden_kisi_id = $3, iptal_zamani = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 AND durum = 'acik' RETURNING id`, [id, surum, kisiId]);
export const refakatPartisiVarMi = async (db: Db, id: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_refakat_partisi WHERE id = $1', [id])) !== null;
// ---- İstisna kartı (Soru 129, 131 a): lotsuz kart, lotsuz düşümleri ve lota bağlanması --------------------------------------------
export const acikIstisnaKarti = (db: Db, uretimEmriId: number, malzemeId: number): Promise<RefakatPartisiHam | null> =>
  db.tek(`${REFAKAT_SECIMI} WHERE r.uretim_emri_id = $1 AND r.malzeme_id = $2 AND r.parti_id IS NULL AND r.durum = 'acik' AND r.birlestigi_refakat_partisi_id IS NULL`,
    [uretimEmriId, malzemeId]);
export const istisnaKartiAc = async (db: Db, r: { uretimEmriId: number; malzemeId: number; kisiId: number }): Promise<number | null> => {
  await islemKilidiAl(db, 'stok_refakat_partisi', r.uretimEmriId);
  return (await db.tek<{ id: number }>(
    `INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id)
     SELECT $1, COALESCE(max(sira), 0) + 1, $2, NULL, $3 FROM stok_refakat_partisi WHERE uretim_emri_id = $1
     ON CONFLICT (uretim_emri_id, malzeme_id) WHERE parti_id IS NULL AND durum = 'acik' AND birlestigi_refakat_partisi_id IS NULL DO NOTHING RETURNING id`,
    [r.uretimEmriId, r.malzemeId, r.kisiId]))?.id ?? null;
};
export const istisnaDusumuYaz = async (db: Db, refakatPartisiId: number, hareketId: number): Promise<void> => {
  await db.sorgu('INSERT INTO stok_refakat_istisna_dusumu (refakat_partisi_id, hareket_id) VALUES ($1, $2)', [refakatPartisiId, hareketId]);
};
export const istisnaDusumuMu = async (db: Db, hareketId: number): Promise<boolean> =>
  (await db.tek('SELECT 1 FROM stok_refakat_istisna_dusumu WHERE hareket_id = $1 AND lot_hareket_id IS NULL', [hareketId])) !== null;
// Sayım düzeltmesi lotsuz düşümü geri alınca bağ ya kalan çıkışa taşınır ya da (tamamı geri alındıysa ve bağlanmadıysa) silinir.
export const istisnaDusumuTasi = async (db: Db, hareketId: number, yeniHareketId: number | null): Promise<void> => {
  if (yeniHareketId === null) await db.sorgu('DELETE FROM stok_refakat_istisna_dusumu WHERE hareket_id = $1 AND lot_hareket_id IS NULL', [hareketId]);
  else await db.sorgu('UPDATE stok_refakat_istisna_dusumu SET hareket_id = $2 WHERE hareket_id = $1 AND lot_hareket_id IS NULL', [hareketId, yeniHareketId]);
};
export interface IstisnaDusumuHam { id: number; hareketId: number; miktar: string; konumId: number; isEmriId: number | null; aciklama: string | null }
// Kartın bağlanmamış lotsuz düşümleri, eskiden yeniye.
export const istisnaDusumleri = (db: Db, refakatPartisiId: number): Promise<IstisnaDusumuHam[]> =>
  db.sorgu(
    `SELECT d.id, h.id AS "hareketId", h.miktar::text AS miktar, h.kaynak_konum_id AS "konumId", h.is_emri_id AS "isEmriId", h.aciklama
       FROM stok_refakat_istisna_dusumu d JOIN stok_hareketi h ON h.id = d.hareket_id
      WHERE d.refakat_partisi_id = $1 AND d.lot_hareket_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
      ORDER BY h.id`, [refakatPartisiId]);
export const istisnaDusumuBagla = async (db: Db, id: number, geriAlmaHareketId: number, lotHareketId: number): Promise<void> => {
  await db.sorgu('UPDATE stok_refakat_istisna_dusumu SET geri_alma_hareket_id = $2, lot_hareket_id = $3 WHERE id = $1', [id, geriAlmaHareketId, lotHareketId]);
};
export interface LotBekleyenKartHam { id: number; bekleyen: string }
// Lot bekleyen kartlar: açık, birleşmemiş, lotsuz kartlar ve bağlanmamış lotsuz düşüm toplamı.
export const lotBekleyenKartlar = (db: Db): Promise<LotBekleyenKartHam[]> =>
  db.sorgu(
    `SELECT r.id, COALESCE((SELECT sum(h.miktar) FROM stok_refakat_istisna_dusumu d JOIN stok_hareketi h ON h.id = d.hareket_id
                             WHERE d.refakat_partisi_id = r.id AND d.lot_hareket_id IS NULL
                               AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)), 0)::text AS bekleyen
       FROM stok_refakat_partisi r
      WHERE r.parti_id IS NULL AND r.durum = 'acik' AND r.birlestigi_refakat_partisi_id IS NULL
      ORDER BY r.kayit_zamani, r.id`);
export const refakatLotaBagla = (db: Db, id: number, partiId: number, kisiId: number): Promise<{ id: number } | null> =>
  db.tek(
    `UPDATE stok_refakat_partisi SET parti_id = $2, lota_baglayan_kisi_id = $3, lota_baglanma_zamani = now(), surum = surum + 1
      WHERE id = $1 AND parti_id IS NULL AND durum = 'acik' AND birlestigi_refakat_partisi_id IS NULL RETURNING id`, [id, partiId, kisiId]);
// Lotun bağlamada düşülebilecek serbest bakiyesi (yoldaki teslime ayrılan düşülür): tercih edilen konum önce, sonra en eski giriş.
// Hurda, karantina, sevkiyat, fason ve yolda konumları alınmaz.
export const lotunBaglamaBakiyeleri = (db: Db, partiId: number, tercihKonumId: number): Promise<{ konumId: number; serbest: string }[]> =>
  db.sorgu(
    `SELECT b.konum_id AS "konumId",
            (b.miktar - COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id AND t.malzeme_id = b.malzeme_id
                                  AND t.parti_id = b.parti_id AND t.statu_id IS NULL AND t.kalite_durumu = b.kalite_durumu), 0))::text AS serbest
       FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
      WHERE b.parti_id = $1 AND b.statu_id IS NULL AND b.kalite_durumu = 'serbest' AND b.miktar > 0
        AND k.tur NOT IN ('fason', 'yolda', ${AYRILMIS_SQL})
      ORDER BY (b.konum_id = $2) DESC, b.ilk_giris NULLS LAST, b.id`, [partiId, tercihKonumId]);
// Partinin emrine o lottan yoldaki teslimler; alan taraf kartı okutunca bunlardan kendisine geleni alır (Soru 118 a).
export const refakatYoldakiTeslimleri = (db: Db, uretimEmriId: number, partiId: number): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} WHERE t.durum = 'yolda' AND t.uretim_emri_id = $1 AND t.parti_id = $2 ORDER BY t.gonderim, t.id`, [uretimEmriId, partiId]);
// Lotun, açık refakat kartı olan emre yoldaki teslimleri: alan taraf lotu değil kartı okutur (kullanıcı akışı 14:16).
export const kartliYoldakiTeslimler = (db: Db, partiId: number): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} JOIN stok_refakat_partisi r ON r.uretim_emri_id = t.uretim_emri_id AND r.parti_id = t.parti_id AND r.durum = 'acik'
    WHERE t.durum = 'yolda' AND t.parti_id = $1 ORDER BY t.gonderim, t.id`, [partiId]);

// Kartın satırları (Soru 128): kartla verilen lotun üretim yerlerindeki (istasyon, üretim çıkışı, ara alan, fason) ve kartın üretim
// partilerinin her yerdeki artı bakiyesi; depodaki lot henüz karta verilmemiştir. yolda, o satırdan gönderilmiş ama alınmamış kısım.
export interface KartSatiriHam {
  konumId: number; konumKod: string; konumAd: string | null; konumTur: KonumTuru; istasyonId: number | null; malzemeId: number; partiId: number; lotNo: string;
  statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string; yolda: string;
}
export const kartSatirlari = (db: Db, kartId: number): Promise<KartSatiriHam[]> =>
  db.sorgu(
    `SELECT b.konum_id AS "konumId", k.kod AS "konumKod", k.ad AS "konumAd", k.tur AS "konumTur", k.istasyon_id AS "istasyonId", b.malzeme_id AS "malzemeId",
            b.parti_id AS "partiId", p.lot_no AS "lotNo", b.statu_id AS "statuId", b.kalite_durumu AS "kaliteDurumu", sum(b.miktar)::text AS miktar,
            COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id AND t.malzeme_id = b.malzeme_id
                       AND t.parti_id = b.parti_id AND t.statu_id IS NOT DISTINCT FROM b.statu_id AND t.kalite_durumu = b.kalite_durumu), 0)::text AS yolda
       FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id JOIN stok_parti p ON p.id = b.parti_id
      WHERE b.miktar > 0
        AND (p.refakat_partisi_id = $1
             OR (b.parti_id = (SELECT r.parti_id FROM stok_refakat_partisi r WHERE r.id = $1) AND k.tur IN ('istasyon', 'uretim_cikisi', 'ara_alan', 'fason', 'yolda')))
      GROUP BY b.konum_id, k.kod, k.ad, k.tur, k.istasyon_id, b.malzeme_id, b.parti_id, p.lot_no, p.refakat_partisi_id, b.statu_id, b.kalite_durumu
      ORDER BY (p.refakat_partisi_id IS NULL) DESC, b.statu_id NULLS FIRST, k.kod`, [kartId]);
