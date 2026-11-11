import type { Db } from '#cekirdek/db.ts';
import type { Dilim, SiralamaIstegi } from '#cekirdek/liste.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { aramaSade } from '#paylasilan/kayit-aramasi.ts';
import type { KaliteDurumu, KonumTuru } from '#paylasilan/sozlesme/stok.ts';
import { hareketFisiTuru } from '../../kurallar.ts';
import { HAREKET_BAGLARI, HAREKET_SECIMI, S, icinde, malzemeFisineBagla } from '../ortak/sorgular.ts';
import type { BakiyeHam, HareketHam, PartiHam } from '../depo/sorgular.ts';

// ---- Bakiye ------------------------------------------------------------------------------------------------------------
const BAKIYE_SECIMI = `SELECT b.id, b.malzeme_id AS "malzemeId", b.konum_id AS "konumId", k.kod AS "konumKod", k.tur AS "konumTur", b.parti_id AS "partiId",
  p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.uretim_emri_id AS "uretimEmriId", b.miktar,
  ${zamanMetni('b.ilk_giris')} AS "ilkGiris", b.ambalaj_tur AS "ambalajTur", b.ambalaj_olcu AS "ambalajOlcu", b.ambalaj_adet AS "ambalajAdet", b.statu_id AS "statuId",
  b.kalite_durumu AS "kaliteDurumu", sk.son_kullanma AS "sonKullanma", ${zamanMetni('b.konuma_gelis')} AS "konumaGelis"
  FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id LEFT JOIN stok_parti p ON p.id = b.parti_id
  LEFT JOIN stok_parti_son_kullanma sk ON sk.parti_id = b.parti_id`;
// Statü verilmezse serbest (statüsüz) satır: düşüm, sayım ve taşıma yalnız serbest stoğa dokunur (STK-S3); statülü stok statü
// değişimiyle serbeste döner. Kalite durumu da aynı kuraldır: verilmezse serbest satır.
export const bakiyeKilitle = (db: Db, malzemeId: number, konumId: number, partiId: number | null, statuId: number | null = null, kalite: KaliteDurumu = 'serbest'): Promise<BakiyeHam | null> =>
  db.tek(`${BAKIYE_SECIMI} WHERE b.malzeme_id = $1 AND b.konum_id = $2 AND b.parti_id IS NOT DISTINCT FROM $3 AND b.statu_id IS NOT DISTINCT FROM $4
            AND b.kalite_durumu = $5 FOR UPDATE OF b`,
    [malzemeId, konumId, partiId, statuId, kalite]);
// Lot numarası ya da üretim emriyle parti (Kalite Merkezi, 229 a); ikisi verilirse ikisine de uyan. Hiçbiri yoksa boş.
export const partileriBul = async (db: Db, a: { lotNo?: string | undefined; uretimEmriId?: number | undefined }): Promise<number[]> =>
  a.lotNo === undefined && a.uretimEmriId === undefined ? [] : (await db.sorgu<{ id: number }>(
    'SELECT id FROM stok_parti WHERE ($1::text IS NULL OR lot_no = $1) AND ($2::int IS NULL OR uretim_emri_id = $2) ORDER BY id', [a.lotNo ?? null, a.uretimEmriId ?? null])).map((r) => r.id);
// Partinin hedef kalitede olmayan artı bakiye satırları; kilit kaliteDegistir'dedir.
export const partininBakiyeleri = (db: Db, partiId: number, haric: KaliteDurumu): Promise<{ malzemeId: number; konumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu }[]> =>
  db.sorgu(`SELECT malzeme_id AS "malzemeId", konum_id AS "konumId", statu_id AS "statuId", kalite_durumu AS "kaliteDurumu" FROM stok_bakiye
              WHERE parti_id = $1 AND kalite_durumu <> $2 AND miktar > 0 ORDER BY id`, [partiId, haric]);
export const partininKarantinaBakiyeleri = (db: Db, partiId: number): Promise<{ malzemeId: number; konumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu }[]> =>
  db.sorgu(`SELECT b.malzeme_id AS "malzemeId", b.konum_id AS "konumId", b.statu_id AS "statuId", b.kalite_durumu AS "kaliteDurumu"
              FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE b.parti_id = $1 AND k.tur = 'karantina' AND b.miktar > 0 ORDER BY b.id`, [partiId]);
// Partilerin red bakiyeleri, yoldaki teslime ayrılan düşülmüş (karantinadan bırakmadaki hesap); önce karantina konumları.
export const partilerinRedBakiyeleri = (db: Db, partiIdler: readonly number[]): Promise<{ partiId: number; konumId: number; statuId: number | null; kullanilabilir: string; karantina: boolean }[]> =>
  db.sorgu(`SELECT b.parti_id AS "partiId", b.konum_id AS "konumId", b.statu_id AS "statuId", k.tur = 'karantina' AS karantina,
              (b.miktar - COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id AND t.malzeme_id = b.malzeme_id
                AND t.parti_id = b.parti_id AND t.statu_id IS NOT DISTINCT FROM b.statu_id AND t.kalite_durumu = b.kalite_durumu), 0))::text AS kullanilabilir
              FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
              WHERE b.parti_id = ANY($1::int[]) AND b.kalite_durumu = 'red' AND b.miktar > 0
              ORDER BY b.parti_id, (k.tur = 'karantina') DESC, b.konum_id, b.statu_id NULLS FIRST`, [partiIdler]);
// Partinin bu karantina konumuna son geldiği (geri alınmamış) taşımanın kaynağı; kaynağı karantina olan ya da mal kabulde doğrudan
// karantinaya giren parti için null.
export const karantinaOncesiKonumu = async (db: Db, partiId: number, konumId: number): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `SELECT h.kaynak_konum_id AS id FROM stok_hareketi h JOIN stok_konum k ON k.id = h.kaynak_konum_id
      WHERE h.parti_id = $1 AND h.hedef_konum_id = $2 AND h.tur = 'transfer' AND k.tur <> 'karantina' AND h.geri_alinan_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
      ORDER BY h.id DESC LIMIT 1`, [partiId, konumId]))?.id ?? null;
// Serbest bırakılan parçanın gidebileceği konumlar: karantina, hurda ve firma (fason, yolda) konumları dışındaki aktif konumlar.
export const karantinaDisiKonumlar = (db: Db): Promise<{ id: number; kod: string; ad: string | null; tur: KonumTuru }[]> =>
  db.sorgu("SELECT id, kod, ad, tur FROM stok_konum WHERE aktif AND tur NOT IN ('karantina', 'hurda', 'fason', 'yolda') ORDER BY kod, id");
// Partinin şu anki red bakiyesini oluşturan redde giriş hareketleri: red bakiyesinin (hareket sırasıyla) en son sıfıra indiği andan
// sonra parçayı red durumuna sokan, geri alınmamış hareketler. Red parçanın konum değiştirmesi giriş sayılmaz; boş kalite serbesttir.
export async function partilerinRedGirisleri(db: Db, partiIdler: readonly number[]): Promise<Map<number, number[]>> {
  if (partiIdler.length === 0) return new Map();
  const idler = [...new Set(partiIdler)];
  const l = await db.sorgu<{ partiId: string; id: string }>(
    `WITH h AS (
       SELECT h.id, h.parti_id,
              (h.hedef_konum_id IS NOT NULL AND coalesce(h.hedef_kalite_durumu, 'serbest') = 'red') AS hedef_red,
              (h.kaynak_konum_id IS NOT NULL AND coalesce(h.kaynak_kalite_durumu, 'serbest') = 'red') AS kaynak_red,
              sum(CASE WHEN h.hedef_konum_id IS NOT NULL AND coalesce(h.hedef_kalite_durumu, 'serbest') = 'red' THEN h.miktar ELSE 0 END
                - CASE WHEN h.kaynak_konum_id IS NOT NULL AND coalesce(h.kaynak_kalite_durumu, 'serbest') = 'red' THEN h.miktar ELSE 0 END)
                OVER (PARTITION BY h.parti_id ORDER BY h.id) AS red
         FROM stok_hareketi h WHERE h.parti_id = ANY($1::bigint[])),
     son_sifir AS (SELECT parti_id, max(id) FILTER (WHERE red <= 0) AS id FROM h GROUP BY parti_id),
     simdiki AS (SELECT parti_id, sum(miktar) AS m FROM stok_bakiye WHERE parti_id = ANY($1::bigint[]) AND kalite_durumu = 'red' GROUP BY parti_id)
     SELECT h.parti_id AS "partiId", h.id
       FROM h JOIN son_sifir z ON z.parti_id = h.parti_id JOIN simdiki s ON s.parti_id = h.parti_id AND s.m > 0
      WHERE h.id > coalesce(z.id, 0) AND h.hedef_red AND NOT h.kaynak_red
        AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
      ORDER BY h.parti_id, h.id`, [idler]);
  const sonuc = new Map<number, number[]>(idler.map((p) => [p, []]));
  for (const x of l) sonuc.get(Number(x.partiId))!.push(Number(x.id));
  return sonuc;
}
export async function hareketPartileri(db: Db, hareketIdler: readonly number[]): Promise<Map<number, number>> {
  if (hareketIdler.length === 0) return new Map();
  const l = await db.sorgu<{ id: number; partiId: number }>(
    'SELECT id, parti_id AS "partiId" FROM stok_hareketi WHERE id = ANY($1::bigint[]) AND parti_id IS NOT NULL', [[...new Set(hareketIdler)]]);
  return new Map(l.map((x) => [Number(x.id), Number(x.partiId)]));
}
// Birden çok bakiye satırına dokunan komut önce hepsini kimlik sırasıyla kilitler: ters yönlü iki aktarım (A'dan B'ye, B'den A'ya)
// satırları aynı sırayla beklediği için birbirini kilitlemez. Olmayan satır kilitlenmez; açılışı ON CONFLICT ile yarışsızdır.
export interface BakiyeAnahtari { malzemeId: number; konumId: number; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu }
export const bakiyeleriKilitle = (db: Db, a: readonly BakiyeAnahtari[]): Promise<unknown[]> => db.sorgu(
  `SELECT b.id FROM stok_bakiye b JOIN unnest($1::int[], $2::int[], $3::bigint[], $4::int[], $5::text[]) AS a(m, k, p, s, q)
     ON b.malzeme_id = a.m AND b.konum_id = a.k AND b.parti_id IS NOT DISTINCT FROM a.p AND b.statu_id IS NOT DISTINCT FROM a.s AND b.kalite_durumu = a.q
   ORDER BY b.id FOR UPDATE OF b`,
  [a.map((x) => x.malzemeId), a.map((x) => x.konumId), a.map((x) => x.partiId), a.map((x) => x.statuId), a.map((x) => x.kaliteDurumu)],
);
export const bakiyeOku = (db: Db, malzemeId: number, konumId: number, partiId: number | null): Promise<BakiyeHam | null> =>
  db.tek(`${BAKIYE_SECIMI} WHERE b.malzeme_id = $1 AND b.konum_id = $2 AND b.parti_id IS NOT DISTINCT FROM $3 AND b.statu_id IS NULL
            AND b.kalite_durumu = 'serbest'`, [malzemeId, konumId, partiId]);
export const konumBakiyeleri = (db: Db, konumId: number): Promise<BakiyeHam[]> => db.sorgu(`${BAKIYE_SECIMI} WHERE b.konum_id = $1 ORDER BY b.ilk_giris, b.id`, [konumId]);
export const malzemeBakiyeleri = (db: Db, malzemeId: number): Promise<BakiyeHam[]> =>
  db.sorgu(`${BAKIYE_SECIMI} WHERE b.malzeme_id = $1 ORDER BY b.ilk_giris, b.id`, [malzemeId]);
export const serbestBakiyeler = (db: Db, malzemeId: number): Promise<BakiyeHam[]> =>
  db.sorgu(`${BAKIYE_SECIMI} WHERE b.malzeme_id = $1 AND b.statu_id IS NULL AND b.kalite_durumu = 'serbest' ORDER BY b.ilk_giris, b.id`, [malzemeId]);
export const gozdekiPartiler = async (db: Db, malzemeId: number, konumId: number, kalite: KaliteDurumu = 'serbest'): Promise<(number | null)[]> =>
  (await db.sorgu<{ partiId: number | null }>(
    'SELECT parti_id AS "partiId" FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id IS NULL AND kalite_durumu = $3 ORDER BY ilk_giris, id',
    [malzemeId, konumId, kalite])).map((r) => r.partiId);
export interface BakiyeYeni { malzemeId: number; konumId: number; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string; ilkGiris: string | null; ambalajTur: string | null; ambalajOlcu: string | null; uzunluk: string | null; genislik: string | null; yukseklik: string | null; ambalajAdet: number | null }
export const bakiyeEkle = (db: Db, b: BakiyeYeni): Promise<unknown[]> => db.sorgu(
  `INSERT INTO stok_bakiye (malzeme_id, konum_id, parti_id, miktar, ilk_giris, ambalaj_tur, ambalaj_olcu, ambalaj_uzunluk_cm, ambalaj_genislik_cm, ambalaj_yukseklik_cm, ambalaj_adet, statu_id, kalite_durumu)
   VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6, $7, $8, $9, $10, $11, $12, $13)
   ON CONFLICT ON CONSTRAINT stok_bakiye_tek DO NOTHING RETURNING id`,
  [b.malzemeId, b.konumId, b.partiId, b.miktar, b.ilkGiris, b.ambalajTur, b.ambalajOlcu, b.uzunluk, b.genislik, b.yukseklik, b.ambalajAdet, b.statuId, b.kaliteDurumu],
);
export const bakiyeGuncelle = (db: Db, id: number, miktar: string, ilkGiris: string, ambalajAdet: number | null): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_bakiye SET miktar = $2, ilk_giris = $3, ambalaj_adet = $4 WHERE id = $1 RETURNING id', [id, miktar, ilkGiris, ambalajAdet]);
// 2224-2 b: satırın bu konuma gelişi hareketlerden yenilenir (göç 20261107171006 ile aynı kural): konuma giren hareketler yeniden
// eskiye toplanır, eldeki miktarı karşılayan giriş anı alınır; aynı konumdaki statü ve kalite değişimi ve geri alınan giriş
// sayılmaz. Hareket bulunmazsa (hareketi bakiyeden sonra yazan akış) var olan değer kalır.
export const konumaGelisYenile = (db: Db, id: number): Promise<unknown[]> => db.sorgu(
  `UPDATE stok_bakiye b SET konuma_gelis = COALESCE((
     SELECT z.zaman FROM (
       SELECT h.zaman, sum(h.miktar) OVER (ORDER BY h.zaman DESC, h.id DESC) AS toplam
       FROM stok_hareketi h
       WHERE h.hedef_konum_id = b.konum_id AND h.malzeme_id = b.malzeme_id AND h.parti_id IS NOT DISTINCT FROM b.parti_id
         AND h.tur IN ('giris', 'transfer', 'sayim_fazla') AND h.kaynak_konum_id IS DISTINCT FROM h.hedef_konum_id
         AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
     ) z
     ORDER BY (z.toplam < b.miktar), CASE WHEN z.toplam >= b.miktar THEN z.toplam ELSE -z.toplam END
     LIMIT 1), b.konuma_gelis)
   WHERE b.id = $1 RETURNING b.id`, [id]);
export const bakiyeSil = (db: Db, id: number): Promise<unknown[]> => db.sorgu('DELETE FROM stok_bakiye WHERE id = $1 RETURNING id', [id]);

// ---- Parti ----------------------------------------------------------------------------------------------------------------
const PARTI_SECIMI = `SELECT p.id, p.malzeme_id AS "malzemeId", p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.sertifika_no AS "sertifikaNo",
  p.uretim_emri_id AS "uretimEmriId", ${zamanMetni('p.kayit_zamani')} AS "kayitZamani",
  COALESCE((SELECT sum(b.miktar) FROM stok_bakiye b WHERE b.parti_id = p.id), 0)::text AS eldeki`;
export const partiBul = (db: Db, id: number): Promise<PartiHam | null> => db.tek(`${PARTI_SECIMI} FROM stok_parti p WHERE p.id = $1`, [id]);
export const lotNoylaParti = (db: Db, lotNo: string): Promise<PartiHam | null> => db.tek(`${PARTI_SECIMI} FROM stok_parti p WHERE upper(p.lot_no) = upper($1)`, [lotNo]);
export const lotBakiyeleri = (db: Db, partiId: number): Promise<BakiyeHam[]> =>
  db.sorgu(`${BAKIYE_SECIMI} WHERE b.parti_id = $1 ORDER BY b.ilk_giris, b.id`, [partiId]);
export interface LotEtiketiHam {
  partiId: number; lotNo: string; malzemeId: number; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null;
  giris: string; miktar: string | null; belgeNo: string | null; sira: number | null;
}
const LOT_ETIKETI_SECIMI = `p.id AS "partiId", p.lot_no AS "lotNo", p.malzeme_id AS "malzemeId", p.tedarikci_parti_no AS "tedarikciPartiNo",
  p.dokum_no AS "dokumNo", p.sertifika_no AS "sertifikaNo"`;
export const malKabulLotEtiketleri = (db: Db, malKabulId: number): Promise<LotEtiketiHam[]> => db.sorgu(
  `SELECT ${LOT_ETIKETI_SECIMI}, ${zamanMetni('mk.zaman')} AS giris, s.sayilan_miktar::text AS miktar, mk.no AS "belgeNo", s.sira::int AS sira
     FROM stok_mal_kabul_satiri s JOIN stok_mal_kabul mk ON mk.id = s.mal_kabul_id JOIN stok_parti p ON p.id = s.parti_id
    WHERE s.mal_kabul_id = $1 ORDER BY s.sira`, [malKabulId]);
// Yeniden basımda miktar ve belge lotun ilk mal kabulündendir; üretim partisinde mal kabul yoktur, alanlar null kalır.
export const partiLotEtiketi = (db: Db, partiId: number): Promise<LotEtiketiHam | null> => db.tek(
  `SELECT ${LOT_ETIKETI_SECIMI}, ${zamanMetni('COALESCE(k.zaman, p.kayit_zamani)')} AS giris, k.miktar, k.no AS "belgeNo", NULL::int AS sira
     FROM stok_parti p LEFT JOIN LATERAL (
       SELECT mk.zaman, s.sayilan_miktar::text AS miktar, mk.no FROM stok_mal_kabul_satiri s JOIN stok_mal_kabul mk ON mk.id = s.mal_kabul_id
        WHERE s.parti_id = p.id ORDER BY s.id LIMIT 1) k ON true
    WHERE p.id = $1`, [partiId]);
export interface PartiAnahtari { malzemeId: number; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null; uretimEmriId: number | null; kisiId: number }
// Var olan parti yalnız emirle bulunur; mal kabulün her gelişi yeni lottur (#124). Refakat kartının partisi emir partisi değildir (#126).
export const emirPartisiBul = async (db: Db, malzemeId: number, uretimEmriId: number): Promise<number | null> =>
  (await db.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1 AND uretim_emri_id = $2 AND refakat_partisi_id IS NULL', [malzemeId, uretimEmriId]))?.id ?? null;
// Eşzamanlı açışta ikincisi çakışmayı yakalar (null) ve var olanı okur.
export const partiAc = async (db: Db, p: PartiAnahtari & { lotNo: string; parcaRevizyonu: string | null }): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_parti (malzeme_id, tedarikci_parti_no, dokum_no, sertifika_no, uretim_emri_id, acan_kisi_id, lot_no, parca_revizyonu)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (malzeme_id, uretim_emri_id) WHERE uretim_emri_id IS NOT NULL AND refakat_partisi_id IS NULL
     DO NOTHING RETURNING id`,
    [p.malzemeId, p.tedarikciPartiNo, p.dokumNo, p.sertifikaNo, p.uretimEmriId, p.kisiId, p.lotNo, p.parcaRevizyonu],
  ))?.id ?? null;
// Refakat kartıyla sayılan parçanın partisi (malzeme, kart başına bir; #126).
export const refakatCiktiPartisiBul = async (db: Db, malzemeId: number, refakatPartisiId: number): Promise<number | null> =>
  (await db.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1 AND refakat_partisi_id = $2', [malzemeId, refakatPartisiId]))?.id ?? null;
export const refakatCiktiPartisiAc = async (
  db: Db, p: { malzemeId: number; uretimEmriId: number; refakatPartisiId: number; kisiId: number; lotNo: string; parcaRevizyonu: string | null },
): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_parti (malzeme_id, uretim_emri_id, refakat_partisi_id, acan_kisi_id, lot_no, parca_revizyonu) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (malzeme_id, refakat_partisi_id) WHERE refakat_partisi_id IS NOT NULL DO NOTHING RETURNING id`,
    [p.malzemeId, p.uretimEmriId, p.refakatPartisiId, p.kisiId, p.lotNo, p.parcaRevizyonu],
  ))?.id ?? null;
// Kartın lotu ve kartla sayılan parçaların partileri: sayım bunları önce kullanır.
export const refakatStokPartileri = async (db: Db, kartlar: readonly number[]): Promise<number[]> =>
  (await db.sorgu<{ id: number }>(
    `SELECT parti_id AS id FROM stok_refakat_partisi WHERE id = ANY($1::int[]) AND parti_id IS NOT NULL
     UNION SELECT id FROM stok_parti WHERE refakat_partisi_id = ANY($1::int[])`, [kartlar],
  )).map((r) => r.id);
// Partinin kaynağı (Soru 126 b): mal kabul lotu (emirsiz) ya da kartla sayılmış üretim partisi; ikisi de değilse kartsız emir partisi.
export const partiKaynagi = (db: Db, id: number): Promise<{ uretimEmriId: number | null; refakatPartisiId: number | null; malzemeId: number } | null> =>
  db.tek('SELECT uretim_emri_id AS "uretimEmriId", refakat_partisi_id AS "refakatPartisiId", malzeme_id AS "malzemeId" FROM stok_parti WHERE id = $1', [id]);
export const refakatUretimiVar = async (db: Db, refakatPartisiId: number): Promise<boolean> =>
  (await db.tek<{ var: boolean }>('SELECT EXISTS (SELECT 1 FROM stok_parti WHERE refakat_partisi_id = $1) AS var', [refakatPartisiId]))?.var ?? false;
export const lotNoVarMi = async (db: Db, no: string): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_parti WHERE lot_no = $1', [no])) !== null;
export interface PartiSuzgeci { malzemeId?: number | undefined; metin?: string | undefined }
const partiSuzgeci = (s: PartiSuzgeci) => ({
  sql: `FROM stok_parti p WHERE ($1::int IS NULL OR p.malzeme_id = $1) AND ($2::text IS NULL OR ${S('p.lot_no')} LIKE $2 OR ${S('p.tedarikci_parti_no')} LIKE $2
        OR ${S('p.dokum_no')} LIKE $2 OR ${S('p.sertifika_no')} LIKE $2)`,
  p: [s.malzemeId ?? null, icinde(s.metin)],
});
export const PARTI_SIRALAMASI: SiralamaTanimi<'kayitZamani' | 'partiNo'> = {
  sutunlar: { kayitZamani: 'p.kayit_zamani', partiNo: 'p.tedarikci_parti_no' }, ikincil: 'p.id', varsayilan: { sutun: 'p.kayit_zamani', yon: 'azalan' },
};
export async function partiSay(db: Db, s: PartiSuzgeci): Promise<number> {
  const f = partiSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${f.sql}`, f.p))?.toplam ?? 0;
}
export function partiler(db: Db, s: PartiSuzgeci, sira: SiralamaIstegi<'kayitZamani' | 'partiNo'>, d: Dilim): Promise<PartiHam[]> {
  const f = partiSuzgeci(s);
  return db.sorgu(`${PARTI_SECIMI} ${f.sql} ORDER BY ${siralamaSql(PARTI_SIRALAMASI, sira)} LIMIT $3 OFFSET $4`, [...f.p, d.sinir, d.atla]);
}

// ---- Hareket -----------------------------------------------------------------------------------------------------------------
export interface HareketYeni {
  tur: HareketHam['tur']; malzemeId: number; partiId: number | null; partiSecimi: string | null; kaynakKonumId: number | null; hedefKonumId: number | null;
  miktar: string; onayliEksi: boolean; girisKaynagi: string | null; cikisNedeni: string | null; uretimEmriId: number | null; geriAlinanId: number | null;
  kisiId: number; aciklama: string | null; kaynakStatuId: number | null; hedefStatuId: number | null;
  kaynakKaliteDurumu: KaliteDurumu | null; hedefKaliteDurumu: KaliteDurumu | null; isEmriId: number | null;
}
// Her hareket tek yerden yazılır: aynı işlemde hareket fişine (1385 a; fişsiz hareketi veritabanı reddeder) ve Logo'ya giden türdeyse
// malzeme fişine (kart #492) bağlanır.
export const hareketYaz = async (db: Db, h: HareketYeni): Promise<number> => {
  const id = await hareketSatiriYaz(db, h);
  await hareketFisineBagla(db, id, h);
  await malzemeFisineBagla(db, id, h);
  return id;
};
// Akış adı işlem boyunca geçerli ayardır (set_config yerel): başka modülün çağırdığı stok yazıcısı onu `akistan` ile koyar.
const AKIS_AYARI = 'tmiv2.stok_akis';
export async function akisAyarla(db: Db, akis: string): Promise<void> { await db.sorgu("SELECT set_config($1, $2, true)", [AKIS_AYARI, akis]); }
// Komut (işlem) ve akış başına, tür grubu başına tek fiş. Fiş değişmez; ikinci hareket var olan fişe satır olarak eklenir.
async function hareketFisineBagla(db: Db, hareketId: number, h: HareketYeni): Promise<void> {
  await db.sorgu(
    `WITH a AS (SELECT NULLIF(current_setting('${AKIS_AYARI}', true), '') AS akis),
       y AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id, akis) SELECT $1, pg_current_xact_id(), $2, a.akis FROM a
             ON CONFLICT (islem_kimligi, tur, (COALESCE(akis, ''))) WHERE islem_kimligi IS NOT NULL DO NOTHING RETURNING id)
     INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id)
     SELECT $3, COALESCE((SELECT id FROM y), (SELECT f.id FROM stok_hareket_fisi f, a
                                               WHERE f.islem_kimligi = pg_current_xact_id() AND f.tur = $1 AND f.akis IS NOT DISTINCT FROM a.akis))`,
    [hareketFisiTuru(h.tur), h.kisiId, hareketId]);
}
const hareketSatiriYaz = async (db: Db, h: HareketYeni): Promise<number> => (await db.tek<{ id: number }>(
  `INSERT INTO stok_hareketi (tur, malzeme_id, parti_id, parti_secimi, kaynak_konum_id, hedef_konum_id, miktar, onayli_eksi, eksi_onay_kaynagi,
     giris_kaynagi, cikis_nedeni, uretim_emri_id, geri_alinan_id, kisi_id, aciklama, kaynak_statu_id, hedef_statu_id, kaynak_kalite_durumu, hedef_kalite_durumu, is_emri_id)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 THEN 'kisi' END, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
  [h.tur, h.malzemeId, h.partiId, h.partiSecimi, h.kaynakKonumId, h.hedefKonumId, h.miktar, h.onayliEksi, h.girisKaynagi, h.cikisNedeni, h.uretimEmriId, h.geriAlinanId, h.kisiId, h.aciklama,
    h.kaynakStatuId, h.hedefStatuId, h.kaynakKaliteDurumu, h.hedefKaliteDurumu, h.isEmriId],
))!.id;
export const hareketBul = (db: Db, id: number): Promise<HareketHam | null> => db.tek(`${HAREKET_SECIMI} ${HAREKET_BAGLARI} WHERE h.id = $1`, [id]);
export interface HareketSuzgeci {
  malzemeId?: number | undefined; konumId?: number | undefined; partiId?: number | undefined; tur?: string | undefined;
  uretimEmriId?: number | undefined; baslangic?: string | undefined; bitis?: string | undefined; metin?: string | undefined;
  // Metnin ad ya da stok kodunda geçtiği kartlar; malzeme tablosu malzemeler modülünündür, servis disari.ts ile bulup verir.
  metinMalzemeleri?: readonly number[] | undefined;
}
const hareketSuzgeci = (s: HareketSuzgeci) => ({
  sql: `${HAREKET_BAGLARI} WHERE ($1::int IS NULL OR h.malzeme_id = $1) AND ($2::int IS NULL OR h.kaynak_konum_id = $2 OR h.hedef_konum_id = $2)
        AND ($3::bigint IS NULL OR h.parti_id = $3) AND ($4::text IS NULL OR h.tur = $4) AND ($5::int IS NULL OR h.uretim_emri_id = $5)
        AND ($6::timestamptz IS NULL OR h.zaman >= $6) AND ($7::timestamptz IS NULL OR h.zaman < $7)
        AND ($8::text IS NULL OR ${S('h.aciklama')} LIKE $8 OR ${S('kk.kod')} LIKE $8 OR ${S('hk.kod')} LIKE $8
          OR ${S('p.lot_no')} LIKE $8 OR ${S('p.tedarikci_parti_no')} LIKE $8 OR ${S('p.dokum_no')} LIKE $8
          OR ${S('(SELECT f.no FROM stok_hareket_fisi f WHERE f.id = hs.fis_id)')} = $9 OR h.malzeme_id = ANY($10::int[]))`,
  p: [s.malzemeId ?? null, s.konumId ?? null, s.partiId ?? null, s.tur ?? null, s.uretimEmriId ?? null, s.baslangic ?? null, s.bitis ?? null,
    icinde(s.metin), s.metin == null ? null : aramaSade(s.metin), s.metin == null ? null : [...(s.metinMalzemeleri ?? [])]],
});
export const suzgecVarMi = (s: HareketSuzgeci): boolean => Object.values(s).some((v) => v !== undefined);
export const HAREKET_SIRALAMASI: SiralamaTanimi<'zaman'> = { sutunlar: { zaman: 'h.zaman' }, ikincil: 'h.id', varsayilan: { sutun: 'h.zaman', yon: 'azalan' } };
export async function hareketSay(db: Db, s: HareketSuzgeci): Promise<number> {
  const f = hareketSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${f.sql}`, f.p))?.toplam ?? 0;
}
export function hareketler(db: Db, s: HareketSuzgeci, sira: SiralamaIstegi<'zaman'>, d: Dilim): Promise<HareketHam[]> {
  const f = hareketSuzgeci(s);
  return db.sorgu(`${HAREKET_SECIMI} ${f.sql} ORDER BY ${siralamaSql(HAREKET_SIRALAMASI, sira)} LIMIT $11 OFFSET $12`, [...f.p, d.sinir, d.atla]);
}

// ---- Son kullanma tarihi (2099-2 c) -------------------------------------------------------------------------------
// Lot başına tek tarih; satır yoksa null.
export const partiSonKullanma = async (db: Db, partiId: number): Promise<string | null> =>
  (await db.tek<{ t: string }>('SELECT son_kullanma AS t FROM stok_parti_son_kullanma WHERE parti_id = $1', [partiId]))?.t ?? null;
export const partiSonKullanmaKilitle = (db: Db, partiId: number): Promise<{ sonKullanma: string; surum: number } | null> =>
  db.tek('SELECT son_kullanma AS "sonKullanma", surum FROM stok_parti_son_kullanma WHERE parti_id = $1 FOR UPDATE', [partiId]);
// Var olan tarih değişmez (çakışmada satır dönmez); farklı tarih sktGirisEngeli ile önceden reddedilir.
export const partiSonKullanmaYaz = async (db: Db, a: { partiId: number; sonKullanma: string; kisiId: number }): Promise<void> => {
  await db.sorgu('INSERT INTO stok_parti_son_kullanma (parti_id, son_kullanma, kisi_id) VALUES ($1, $2, $3) ON CONFLICT (parti_id) DO NOTHING',
    [a.partiId, a.sonKullanma, a.kisiId]);
};
// Düzeltme sürümle yazılır; eski ve yeni değer değişiklik defterine tetikle düşer.
export const partiSonKullanmaDuzelt = async (db: Db, a: { partiId: number; sonKullanma: string; kisiId: number; surum: number }): Promise<boolean> =>
  (await db.tek<{ parti_id: number }>(
    `UPDATE stok_parti_son_kullanma SET son_kullanma = $2, kisi_id = $3, guncelleme = now(), surum = surum + 1
      WHERE parti_id = $1 AND surum = $4 RETURNING parti_id`, [a.partiId, a.sonKullanma, a.kisiId, a.surum])) !== null;
// Partinin malzemesi (düzeltmede kartın takipli olduğu denetlenir).
export const partiMalzemesi = async (db: Db, partiId: number): Promise<number | null> =>
  (await db.tek<{ m: number }>('SELECT malzeme_id AS m FROM stok_parti WHERE id = $1', [partiId]))?.m ?? null;
// Tür listesi (2099-6 a): kartların en yakın SKT'si ve geçmiş SKT'li serbest miktarı. Bakiyesi olmayan kart satır vermez.
export const kartSktOzetleri = (db: Db, idler: readonly number[], bugun: string): Promise<{ malzemeId: number; enYakin: string | null; gecmisMiktar: string }[]> =>
  db.sorgu(
    `SELECT b.malzeme_id AS "malzemeId", min(sk.son_kullanma) FILTER (WHERE b.miktar > 0) AS "enYakin",
            COALESCE(sum(b.miktar) FILTER (WHERE b.miktar > 0 AND sk.son_kullanma < $2::date), 0)::text AS "gecmisMiktar"
       FROM stok_bakiye b LEFT JOIN stok_parti_son_kullanma sk ON sk.parti_id = b.parti_id
      WHERE b.malzeme_id = ANY($1::int[]) GROUP BY b.malzeme_id`, [idler, bugun]);
