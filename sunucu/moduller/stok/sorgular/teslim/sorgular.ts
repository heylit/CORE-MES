import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { aramaSade, basDeseni, icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import type { KaliteDurumu, KonumTuru, TeslimDurumu } from '#paylasilan/sozlesme/stok.ts';
import { SAYIM_DISI_KONUMLAR } from '../../kurallar.ts';
import { KULLANILABILIR_SQL, S, TESLIM_SECIMI } from '../ortak/sorgular.ts';

// ---- Malzeme · Teslim (kart #1208) ----------------------------------------------------------------------------------------
// İstasyonun stok konumu: istasyondan kendiliğinden açılır; aynı istasyona eşzamanlı ikinci açılış satır döndürmez, çağıran okur.
export const istasyonKonumlari = (db: Db, istasyonIdler: readonly number[]): Promise<{ istasyonId: number; konumId: number; kod: string }[]> =>
  db.sorgu('SELECT istasyon_id AS "istasyonId", id AS "konumId", kod FROM stok_konum WHERE istasyon_id = ANY($1::int[])', [[...istasyonIdler]]);
export const istasyonKonumu = async (db: Db, istasyonId: number): Promise<number | null> =>
  (await db.tek<{ id: number }>('SELECT id FROM stok_konum WHERE istasyon_id = $1', [istasyonId]))?.id ?? null;
// Konuma son giren hareket (malzeme, parti, statü ekseninde): kişi ve zaman. Geri alma giriş sayılmaz.
// Köken (soru 89, sepet süzgeci): giriş ve aynı yerdeki statü dönüşümü üretimdir; başka yerden gelen transfer teslim alınandır.
export const konumaSonGirisler = (db: Db, konumId: number): Promise<{ malzemeId: number; partiId: number | null; statuId: number | null; kisiId: number; zaman: string; koken: 'uretim' | 'teslim' }[]> => db.sorgu(
  `SELECT DISTINCT ON (h.malzeme_id, h.parti_id, h.hedef_statu_id) h.malzeme_id AS "malzemeId", h.parti_id::int AS "partiId", h.hedef_statu_id AS "statuId",
     h.kisi_id AS "kisiId", ${zamanMetni('h.zaman')} AS zaman,
     CASE WHEN h.kaynak_konum_id IS NULL OR h.kaynak_konum_id = h.hedef_konum_id THEN 'uretim' ELSE 'teslim' END AS koken
   FROM stok_hareketi h WHERE h.hedef_konum_id = $1 AND h.tur <> 'geri_alma'
   ORDER BY h.malzeme_id, h.parti_id, h.hedef_statu_id, h.zaman DESC, h.id DESC`, [konumId]);
export const istasyonKonumuAc = async (db: Db, k: { depoId: number; kod: string; ad: string; istasyonId: number }): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_konum (depo_id, kod, tur, ad, istasyon_id) VALUES ($1, $2, 'istasyon', $3, $4)
     ON CONFLICT ON CONSTRAINT stok_konum_istasyon_tek DO NOTHING RETURNING id`, [k.depoId, k.kod, k.ad, k.istasyonId]))?.id ?? null;
export const teslimUclari = (db: Db, konumIdler: number[]): Promise<{ konumId: number; kod: string; ad: string | null; istasyonId: number | null; tur: KonumTuru; aktif: boolean }[]> =>
  konumIdler.length === 0 ? Promise.resolve([]) : db.sorgu(
    'SELECT id AS "konumId", kod, ad, istasyon_id AS "istasyonId", tur, aktif FROM stok_konum WHERE id = ANY($1::int[])', [konumIdler]);
// İstek seçicisi: depo konumlarındaki (raf, kabul, zemin) kullanılabilir ve statülü miktar.
export const istekStoklari = (db: Db, malzemeIdler: number[]): Promise<{ malzemeId: number; statuId: number | null; miktar: string }[]> =>
  malzemeIdler.length === 0 ? Promise.resolve([]) : db.sorgu(
    `SELECT b.malzeme_id AS "malzemeId", b.statu_id AS "statuId", sum(b.miktar)::text AS miktar
       FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
      WHERE b.malzeme_id = ANY($1::int[]) AND k.tur IN ('raf_gozu', 'kabul', 'depo_zemini') AND b.miktar > 0 AND b.${KULLANILABILIR_SQL}
      GROUP BY b.malzeme_id, b.statu_id ORDER BY b.malzeme_id, b.statu_id NULLS FIRST`, [malzemeIdler]);

export interface TeslimHam {
  id: number; no: string; kaynakKimligi: string; malzemeId: number; miktar: string; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu; kaynakKonumId: number; hedefKonumId: number;
  uretimEmriId: number | null; istekId: number | null; aciklama: string | null; durum: TeslimDurumu; alinan: string | null; redNedeni: string | null; hareketId: number | null;
  gonderenKisiId: number; kapatanKisiId: number | null; aliciKisiId: number | null; gonderim: string; kapanis: string | null; surum: number;
  okutarak: boolean; itirazSonu: string | null; itirazNedeni: string | null; itirazKisiId: number | null; itirazZamani: string | null; iadeTeslimId: number | null;
}
export const teslimAc = async (db: Db, t: {
  no: string; kaynakKimligi: string; malzemeId: number; miktar: string; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu;
  kaynakKonumId: number; hedefKonumId: number; uretimEmriId: number | null; isEmriId: number | null; istekId: number | null; aciklama: string | null; gonderenKisiId: number;
  aliciKisiId?: number | null; itirazSonu?: string | null;
}): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_teslim (no, kaynak_kimligi, malzeme_id, miktar, parti_id, statu_id, kaynak_konum_id, hedef_konum_id, uretim_emri_id, istek_id, aciklama, gonderen_kisi_id,
       kalite_durumu, is_emri_id, alici_kisi_id, okutarak, itiraz_sonu)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz IS NOT NULL, $16::timestamptz)
     ON CONFLICT ON CONSTRAINT stok_teslim_kaynak_tek DO NOTHING RETURNING id`,
    [t.no, t.kaynakKimligi, t.malzemeId, t.miktar, t.partiId, t.statuId, t.kaynakKonumId, t.hedefKonumId, t.uretimEmriId, t.istekId, t.aciklama, t.gonderenKisiId,
      t.kaliteDurumu, t.isEmriId, t.aliciKisiId ?? null, t.itirazSonu ?? null]))?.id ?? null;
export const teslimBul = (db: Db, id: number, kilit = false): Promise<TeslimHam | null> => db.tek(`${TESLIM_SECIMI} WHERE t.id = $1${kilit ? ' FOR UPDATE OF t' : ''}`, [id]);
export const teslimKaynaktan = (db: Db, kaynakKimligi: string): Promise<TeslimHam | null> => db.tek(`${TESLIM_SECIMI} WHERE t.kaynak_kimligi = $1`, [kaynakKimligi]);
// Adında verilen sözcük geçen konumlar (istasyon konumu sayılmaz); tam ad eşleşmesini Türkçe harf kuralıyla çağıran yapar.
export const adiGecenKonumlar = (db: Db, sozcuk: string): Promise<{ id: number; kod: string; ad: string; tur: KonumTuru }[]> =>
  db.sorgu(`SELECT id, kod, ad, tur FROM stok_konum WHERE aktif AND tur <> 'istasyon' AND ${S('ad')} LIKE $1 ORDER BY id`, [icindeDeseni(sozcuk)]);
// Teslim hedefi olabilen depo konumları: rafsız depo alanları (kabul, depo zemini); raf gözüne yerleştirme depo işidir.
export const teslimDepoKonumlari = (db: Db): Promise<{ id: number; kod: string; ad: string | null }[]> =>
  db.sorgu("SELECT id, kod, ad FROM stok_konum WHERE aktif AND tur IN ('kabul', 'depo_zemini') ORDER BY kod");
// Depo dışından bırakılan malın düştüğü yer (Soru 133): ilk etkin mal kabul alanı.
export const ilkKabulKonumu = async (db: Db): Promise<number | null> =>
  (await db.tek<{ id: number }>("SELECT id FROM stok_konum WHERE aktif AND tur = 'kabul' ORDER BY kod, id LIMIT 1"))?.id ?? null;
export const ilkKarantinaKonumu = async (db: Db): Promise<number | null> =>
  (await db.tek<{ id: number }>("SELECT id FROM stok_konum WHERE aktif AND tur = 'karantina' ORDER BY kod, id LIMIT 1"))?.id ?? null;
// Yolda süresi dolan, okutarak alınmamış teslimler; çoklu çalışan iş aynı satırı iki kez iptal etmesin diye kilitli ve atlamalı.
export const suresiDolanTeslimler = (db: Db, dakika: number): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} WHERE t.durum = 'yolda' AND NOT t.okutarak AND t.gonderim + $1 * interval '1 minute' < now()
    ORDER BY t.gonderim, t.id LIMIT 200 FOR UPDATE OF t SKIP LOCKED`, [dakika]);
export const teslimAraAlanlari = (db: Db): Promise<{ id: number; kod: string; ad: string | null }[]> =>
  db.sorgu("SELECT id, kod, ad FROM stok_konum WHERE aktif AND tur = 'ara_alan' ORDER BY kod");
export const konumdakiPartiler = async (db: Db, malzemeId: number, konumId: number, statuId: number | null, kalite: KaliteDurumu = 'serbest'): Promise<(number | null)[]> =>
  (await db.sorgu<{ partiId: number | null }>(
    'SELECT parti_id AS "partiId" FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id IS NOT DISTINCT FROM $3 AND kalite_durumu = $4 ORDER BY ilk_giris, id',
    [malzemeId, konumId, statuId, kalite])).map((r) => r.partiId);
// 1229 a: konumda bir malzemenin tek statü ve kalitedeki partileri (lotsuz dahil), en eski giriş önce; yoldaki teslime ayrılan düşülür.
export const konumdakiPartiMiktarlari = (db: Db, malzemeId: number, konumId: number, statuId: number | null, kalite: KaliteDurumu): Promise<{ partiId: number | null; serbest: string }[]> =>
  db.sorgu(
    `SELECT b.parti_id AS "partiId", (b.miktar - COALESCE((SELECT sum(t.miktar) FROM stok_teslim t WHERE t.durum = 'yolda' AND t.kaynak_konum_id = b.konum_id
              AND t.malzeme_id = b.malzeme_id AND t.parti_id IS NOT DISTINCT FROM b.parti_id AND t.statu_id IS NOT DISTINCT FROM b.statu_id AND t.kalite_durumu = b.kalite_durumu), 0))::text AS serbest
       FROM stok_bakiye b WHERE b.malzeme_id = $1 AND b.konum_id = $2 AND b.statu_id IS NOT DISTINCT FROM $3 AND b.kalite_durumu = $4 AND b.miktar > 0
      ORDER BY b.ilk_giris, b.id`, [malzemeId, konumId, statuId, kalite]);
export const teslimVarMi = async (db: Db, id: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_teslim WHERE id = $1', [id])) !== null;
// Gelenler: yoldaki teslimler; hedefIstasyonlar null ise bütün istasyonlar, depoDahil ise istasyon olmayan hedefler de.
export const yoldakiGelenler = (db: Db, hedefIstasyonlar: number[] | null, depoDahil: boolean): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} JOIN stok_konum h ON h.id = t.hedef_konum_id
    WHERE t.durum = 'yolda' AND ((h.istasyon_id IS NOT NULL AND ($1::int[] IS NULL OR h.istasyon_id = ANY($1::int[]))) OR ($2 AND h.istasyon_id IS NULL))
    ORDER BY t.gonderim, t.id LIMIT 100`, [hedefIstasyonlar, depoDahil]);
// Bir ucu kapsamdaki istasyonda olan onaysız teslimler, itiraz süresi bitmemiş (soru 96 b, telafi 3): okutarak alınan kaynak tarafa,
// bırakılan hedef tarafa düşer (Soru 133); kişinin kendi kapattığı görünmez. null ise bütün istasyonlar.
export const okutarakAlinanlar = (db: Db, istasyonlar: number[] | null, kisiId: number): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} JOIN stok_konum k ON k.id = t.kaynak_konum_id JOIN stok_konum h ON h.id = t.hedef_konum_id
    WHERE t.okutarak AND t.durum = 'teslim' AND t.itiraz_nedeni IS NULL AND t.itiraz_sonu > now() AND t.kapatan_kisi_id IS DISTINCT FROM $2
      AND (k.istasyon_id IS NOT NULL OR h.istasyon_id IS NOT NULL)
      AND ($1::int[] IS NULL OR k.istasyon_id = ANY($1::int[]) OR h.istasyon_id = ANY($1::int[]))
    ORDER BY t.kapanis DESC, t.id DESC LIMIT 50`, [istasyonlar, kisiId]);
// İtiraz yalnız bir kez ve süre içinde yazılır; geri alma yapmaz, iade teslimi ayrıca bağlanır.
export const itirazYaz = (db: Db, id: number, surum: number, k: { neden: string; kisiId: number }): Promise<{ id: number } | null> =>
  db.tek(
    `UPDATE stok_teslim SET itiraz_nedeni = $3, itiraz_kisi_id = $4, itiraz_zamani = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 AND okutarak AND durum = 'teslim' AND itiraz_nedeni IS NULL AND itiraz_sonu > now() RETURNING id`,
    [id, surum, k.neden, k.kisiId]);
export const iadeBagla = (db: Db, id: number, iadeTeslimId: number): Promise<unknown> =>
  db.sorgu('UPDATE stok_teslim SET iade_teslim_id = $2 WHERE id = $1 AND iade_teslim_id IS NULL', [id, iadeTeslimId]);
export const gonderdiklerim = (db: Db, kisiId: number): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} WHERE t.gonderen_kisi_id = $1 AND (t.durum = 'yolda' OR t.kapanis > now() - interval '7 days')
    ORDER BY t.gonderim DESC, t.id DESC LIMIT 50`, [kisiId]);
// Son yaptıklarım (3085): kişinin bugün (tesis saat diliminde) gönderdiği teslimler ve yaptığı taşımalar, yeniden eskiye, en çok 10.
// Teslimin kabulünde yazılan hareket teslim satırıdır, taşıma sayılmaz; aynı yerde statü dönüşümü taşıma değildir.
export interface SonIslemHam {
  tur: 'teslim' | 'tasima'; id: number; no: string | null; malzemeId: number; lotNo: string | null; miktar: string; hedefKonumId: number;
  aliciKisiId: number | null; durum: 'yapildi' | TeslimDurumu; redNedeni: string | null; zaman: string; surum: number | null;
}
export const sonIslemlerim = (db: Db, kisiId: number): Promise<SonIslemHam[]> =>
  db.sorgu(`SELECT tur, id, no, "malzemeId", "lotNo", miktar, "hedefKonumId", "aliciKisiId", durum, "redNedeni", ${zamanMetni('z')} AS zaman, surum FROM (
      SELECT 'teslim' AS tur, t.id::int AS id, t.no, t.malzeme_id AS "malzemeId", p.lot_no AS "lotNo", t.miktar::text AS miktar, t.hedef_konum_id AS "hedefKonumId",
             t.alici_kisi_id AS "aliciKisiId", t.durum, t.red_nedeni AS "redNedeni", t.gonderim AS z, t.surum
        FROM stok_teslim t LEFT JOIN stok_parti p ON p.id = t.parti_id
       WHERE t.gonderen_kisi_id = $1 AND t.gonderim >= current_date
      UNION ALL
      SELECT 'tasima', h.id::int, NULL, h.malzeme_id, p.lot_no, h.miktar::text, h.hedef_konum_id, NULL, 'yapildi', NULL, h.zaman, NULL
        FROM stok_hareketi h LEFT JOIN stok_parti p ON p.id = h.parti_id
       WHERE h.kisi_id = $1 AND h.tur = 'transfer' AND h.zaman >= current_date AND h.kaynak_konum_id IS DISTINCT FROM h.hedef_konum_id
         AND NOT EXISTS (SELECT 1 FROM stok_teslim t WHERE t.hareket_id = h.id)
    ) x ORDER BY z DESC, tur, id DESC LIMIT 10`, [kisiId]);
export const teslimKapat = (db: Db, id: number, surum: number, k: { durum: 'teslim' | 'red' | 'iptal'; alinan: string | null; redNedeni: string | null; hareketId: number | null; kisiId: number }): Promise<{ id: number } | null> =>
  db.tek(
    `UPDATE stok_teslim SET durum = $3, alinan = $4, red_nedeni = $5, hareket_id = $6, kapatan_kisi_id = $7, kapanis = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 AND durum = 'yolda' RETURNING id`,
    [id, surum, k.durum, k.alinan, k.redNedeni, k.hareketId, k.kisiId]);
// Kapanan teslime neden notu: red nedeni yalnız reddin alanıdır (stok_teslim_red_tutarli), iptalin nedeni açıklamaya yazılır.
export const teslimeNotYaz = (db: Db, id: number, not: string): Promise<unknown> =>
  db.sorgu("UPDATE stok_teslim SET aciklama = left($2 || coalesce(' · ' || aciklama, ''), 200) WHERE id = $1", [id, not]);
// Kaynaktaki yoldaki teslimler (kart #1410): gönderim ve kullanım bunları düşerek serbest miktarı bulur.
export const yoldaAyrilan = async (db: Db, malzemeId: number, konumId: number, partiId: number | null, statuId: number | null, kalite: KaliteDurumu = 'serbest'): Promise<string> =>
  (await db.tek<{ m: string }>(`SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_teslim WHERE durum = 'yolda' AND kaynak_konum_id = $2 AND malzeme_id = $1
    AND parti_id IS NOT DISTINCT FROM $3 AND statu_id IS NOT DISTINCT FROM $4 AND kalite_durumu = $5`, [malzemeId, konumId, partiId, statuId, kalite]))!.m;
export const konumdakiYoldaAyrilanlar = (db: Db, konumId: number): Promise<{ malzemeId: number; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string }[]> =>
  db.sorgu(`SELECT malzeme_id AS "malzemeId", parti_id AS "partiId", statu_id AS "statuId", kalite_durumu AS "kaliteDurumu", sum(miktar)::text AS miktar FROM stok_teslim
    WHERE durum = 'yolda' AND kaynak_konum_id = $1 GROUP BY malzeme_id, parti_id, statu_id, kalite_durumu`, [konumId]);
export const konumlardakiYoldaAyrilanlar = (db: Db, malzemeId: number, konumIdler: number[]): Promise<{ konumId: number; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string }[]> =>
  konumIdler.length === 0 ? Promise.resolve([]) : db.sorgu(`SELECT kaynak_konum_id AS "konumId", parti_id AS "partiId", statu_id AS "statuId", kalite_durumu AS "kaliteDurumu", sum(miktar)::text AS miktar
    FROM stok_teslim WHERE durum = 'yolda' AND malzeme_id = $1 AND kaynak_konum_id = ANY($2::int[]) GROUP BY kaynak_konum_id, parti_id, statu_id, kalite_durumu`, [malzemeId, konumIdler]);
// Başkasının sepetindeki miktar (1338 a, 1342 a): yalnız etiket içindir, stok ayırmaz; kişinin kendi satırı gelmez.
export const baskaSepetlerdekiler = (db: Db, konumIdler: number[], haricKisiId: number): Promise<{ konumId: number; malzemeId: number; partiId: number | null; kisiId: number; miktar: string }[]> =>
  konumIdler.length === 0 ? Promise.resolve([]) : db.sorgu(`SELECT kaynak_konum_id AS "konumId", malzeme_id AS "malzemeId", parti_id AS "partiId", kisi_id AS "kisiId", sum(miktar)::text AS miktar
    FROM stok_sepet_satiri WHERE kaynak_konum_id = ANY($1::int[]) AND kisi_id <> $2 GROUP BY kaynak_konum_id, malzeme_id, parti_id, kisi_id ORDER BY kisi_id`, [konumIdler, haricKisiId]);
// Raf etiketi (RAF:<kod>) rafı kodla bulur; kapalı raf okunmaz. Kod depolar arasında tekrar ederse etiket rafı ayırt etmez, null döner.
export const rafKoduyla = async (db: Db, kod: string): Promise<{ id: number; kod: string } | null> => {
  const r = await db.sorgu<{ id: number; kod: string }>('SELECT id, kod FROM stok_raf WHERE aktif AND kod = upper($1) ORDER BY id LIMIT 2', [kod]);
  return r.length === 1 ? r[0]! : null;
};
// Teslimin stok hareketi geri alınınca teslim iptal sayılır (kart #1410): hareket bağı iz için kalır, alınan boşalır.
export const teslimGeriAlindi = (db: Db, hareketId: number, kisiId: number): Promise<{ id: number; istekId: number | null } | null> =>
  db.tek(`UPDATE stok_teslim SET durum = 'iptal', alinan = NULL, kapatan_kisi_id = $2, kapanis = now(), surum = surum + 1
    WHERE hareket_id = $1 AND durum = 'teslim' RETURNING id, istek_id AS "istekId"`, [hareketId, kisiId]);
export const yoldakiTeslimSayisi = async (db: Db, hedefIstasyonlar: number[] | null, depoDahil: boolean): Promise<number> =>
  (await db.tek<{ n: number }>(`SELECT count(*)::int AS n FROM stok_teslim t JOIN stok_konum h ON h.id = t.hedef_konum_id
    WHERE t.durum = 'yolda' AND ((h.istasyon_id IS NOT NULL AND ($1::int[] IS NULL OR h.istasyon_id = ANY($1::int[]))) OR ($2 AND h.istasyon_id IS NULL))`, [hedefIstasyonlar, depoDahil]))?.n ?? 0;

// ---- Yerleşim ---------------------------------------------------------------------------------------------------------------
export interface YerlesimHam { sayim_suresi_gun: number; bina_x0: string; bina_x1: string; bina_z0: string; bina_z1: string; kabul_x: string; kabul_z: string; kabul_genislik: string; kabul_derinlik: string; kare_boyu: string; fason_x: string; fason_z: string; fason_aci: 0 | 90 | 180 | 270; surum: number }
export const yerlesim = (db: Db, depoId: number): Promise<YerlesimHam | null> => db.tek('SELECT * FROM stok_depo_yerlesimi WHERE depo_id = $1', [depoId]);
export const depoBul = (db: Db, id: number): Promise<{ id: number; kod: string; ad: string } | null> => db.tek('SELECT id, kod, ad FROM stok_depo WHERE id = $1', [id]);
export const depoAdiYaz = (db: Db, id: number, ad: string): Promise<unknown[]> => db.sorgu('UPDATE stok_depo SET ad = $2, surum = surum + 1 WHERE id = $1 AND ad <> $2 RETURNING id', [id, ad]);
export const yerlesimGuncelle = (db: Db, depoId: number, surum: number, y: { bina: { x0: number; x1: number; z0: number; z1: number }; kabul: { x: number; z: number; genislik: number; derinlik: number }; kareBoyu: number; sayimSuresiGun: number; fason: { x: number; z: number; aci: number } }): Promise<{ depo_id: number } | null> =>
  db.tek(`UPDATE stok_depo_yerlesimi SET bina_x0 = $3, bina_x1 = $4, bina_z0 = $5, bina_z1 = $6, kabul_x = $7, kabul_z = $8, kabul_genislik = $9, kabul_derinlik = $10,
      kare_boyu = $11, fason_x = $12, fason_z = $13, fason_aci = $14, sayim_suresi_gun = $15, surum = surum + 1 WHERE depo_id = $1 AND surum = $2 RETURNING depo_id`,
    [depoId, surum, y.bina.x0, y.bina.x1, y.bina.z0, y.bina.z1, y.kabul.x, y.kabul.z, y.kabul.genislik, y.kabul.derinlik, y.kareBoyu, y.fason.x, y.fason.z, y.fason.aci, y.sayimSuresiGun]);
export const yerlesimVarMi = async (db: Db, depoId: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_depo_yerlesimi WHERE depo_id = $1', [depoId])) !== null;
export const rafYeriYaz = (db: Db, id: number, y: { xM: number; zM: number; aci: number; onYuzTers: boolean }): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_raf SET x_m = $2, z_m = $3, aci = $4, on_yuz_ters = $5 WHERE id = $1 RETURNING id', [id, y.xM, y.zM, y.aci, y.onYuzTers]);
export interface YerlesimRafHam { id: number; surum: number; kod: string; tur: 'palet' | 'celik' | 'konsol' | 'zemin'; numaralama: 'sirali' | 'tek' | 'cift'; ilkBolme: number; bolmeSayisi: number; katSayisi: number; bolmeGenislikM: string; derinlikM: string; katAraligiM: string; xM: string; zM: string; aci: 0 | 90 | 180 | 270; onYuzTers: boolean; doluBolmeler: number[]; stokluGoz: number }
// doluBolmeler: bölme sırasına (0'dan) göre dolu kat sayısı (düzenleyicideki doluluk çubukları).
export const yerlesimRaflari = (db: Db, depoId: number): Promise<YerlesimRafHam[]> => db.sorgu(
  `SELECT r.id, r.surum, r.kod, r.tur, r.numaralama, r.ilk_bolme AS "ilkBolme", r.bolme_sayisi AS "bolmeSayisi", r.kat_sayisi AS "katSayisi",
     r.bolme_genislik_m AS "bolmeGenislikM", r.derinlik_m AS "derinlikM", r.kat_araligi_m AS "katAraligiM", r.x_m AS "xM", r.z_m AS "zM", r.aci, r.on_yuz_ters AS "onYuzTers",
     COALESCE((SELECT array_agg(d.n ORDER BY d.bolme_no) FROM (SELECT k.bolme_no, count(DISTINCT k.id) FILTER (WHERE EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.konum_id = k.id))::int AS n
        FROM stok_konum k WHERE k.raf_id = r.id AND k.aktif GROUP BY k.bolme_no) d), '{}') AS "doluBolmeler",
     (SELECT count(DISTINCT b.konum_id)::int FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE k.raf_id = r.id) AS "stokluGoz"
   FROM stok_raf r WHERE r.aktif AND r.depo_id = $1 ORDER BY r.kod, r.id`, [depoId]);
// Numaralama değişince göz bölme sırasıyla yeni bölme no'ya geçer; iki adımda (geçici artı payla) tekillik bozulmadan.
export async function gozleriYenidenNumarala(db: Db, rafId: number, eski: number[], yeni: number[]): Promise<void> {
  const n = Math.min(eski.length, yeni.length), es: number[] = [], ye: number[] = [];
  for (let k = 0; k < n; k++) if (eski[k] !== yeni[k]) { es.push(eski[k]!); ye.push(yeni[k]!); }
  if (es.length === 0) return;
  await db.sorgu('UPDATE stok_konum k SET bolme_no = k.bolme_no + 100000 FROM unnest($2::int[]) AS e(b) WHERE k.raf_id = $1 AND k.bolme_no = e.b RETURNING k.id', [rafId, es]);
  await db.sorgu('UPDATE stok_konum k SET bolme_no = m.y, surum = k.surum + 1 FROM unnest($2::int[], $3::int[]) AS m(e, y) WHERE k.raf_id = $1 AND k.bolme_no = m.e + 100000 RETURNING k.id', [rafId, es, ye]);
}
export const kodDenetiminiErtele = (db: Db): Promise<unknown[]> => db.sorgu('SET CONSTRAINTS stok_konum_kod_tek DEFERRED');
export const kodDenetiminiAc = (db: Db): Promise<unknown[]> => db.sorgu('SET CONSTRAINTS stok_konum_kod_tek IMMEDIATE');

// ---- Arama ----------------------------------------------------------------------------------------------------------------
// $1 sade metin (tam eşleşme), $2 baştan, $3 içinde, $4 kaçırılmış sade metin ("-" ile biten kod sonu için).
const aramaDesenleri = (q: string): [string, string, string, string] => [aramaSade(q), basDeseni(q), icindeDeseni(q), icindeDeseni(q).slice(1, -1)];
export const konumAra = (db: Db, q: string): Promise<{ konumId: number; kod: string; ad: string | null; satirSayisi: number }[]> => db.sorgu(
  `SELECT k.id AS "konumId", k.kod, k.ad, (SELECT count(*)::int FROM stok_bakiye b WHERE b.konum_id = k.id) AS "satirSayisi"
   FROM stok_konum k WHERE k.aktif AND (${S('k.kod')} LIKE $2 OR ${S('k.kod')} LIKE '%-' || $4 OR ${S('k.ad')} LIKE $3)
   ORDER BY (${S('k.kod')} = $1) DESC, k.kod LIMIT 6`, aramaDesenleri(q));
export const rafAra = (db: Db, q: string): Promise<{ rafId: number; kod: string; rafTuru: 'palet' | 'celik' | 'konsol' | 'zemin' }[]> =>
  db.sorgu(`SELECT id AS "rafId", kod, tur AS "rafTuru" FROM stok_raf WHERE aktif AND (${S('kod')} = $1 OR ${S("'RAF ' || kod")} = $1) ORDER BY id LIMIT 3`, [aramaSade(q)]);
export const partiAra = (db: Db, q: string): Promise<{ partiId: number; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; uretimEmriId: number | null; malzemeId: number }[]> => db.sorgu(
  `SELECT id AS "partiId", lot_no AS "lotNo", tedarikci_parti_no AS "tedarikciPartiNo", dokum_no AS "dokumNo", uretim_emri_id AS "uretimEmriId", malzeme_id AS "malzemeId"
   FROM stok_parti WHERE ${S('lot_no')} LIKE $1 OR ${S('tedarikci_parti_no')} LIKE $1 OR ${S('dokum_no')} LIKE $1 ORDER BY kayit_zamani DESC LIMIT 4`, [icindeDeseni(q)]);

// Genel arama (Ctrl K, kart 1234): sütun ve sorgu public.arama_sade ile sadeleşir (Türkçe harf dil ayarına bırakılmaz); desenler
// çekirdekten sadeleşmiş ve kaçırılmış gelir. İfade trigram dizinini kullanır (göç 126000). Sıra: tam kod, koddan başlayan, yeniden eskiye.
interface AramaDesenleri { sade: string; icindeDeseni: string; basDeseni: string; sinir: number }
export interface PartiKaydi { partiId: number; lotNo: string; tedarikciPartiNo: string | null; dokumNo: string | null; uretimEmriId: number | null; malzemeId: number }
export const partiKayitAra = (db: Db, d: AramaDesenleri): Promise<PartiKaydi[]> => db.sorgu(
  `SELECT id::int AS "partiId", lot_no AS "lotNo", tedarikci_parti_no AS "tedarikciPartiNo", dokum_no AS "dokumNo", uretim_emri_id AS "uretimEmriId", malzeme_id AS "malzemeId"
   FROM stok_parti WHERE public.arama_sade(lot_no) LIKE $2 OR public.arama_sade(tedarikci_parti_no) LIKE $2 OR public.arama_sade(dokum_no) LIKE $2
   ORDER BY (public.arama_sade(lot_no) = $1) DESC, (public.arama_sade(lot_no) LIKE $3) DESC, kayit_zamani DESC, id DESC LIMIT $4`, [d.sade, d.icindeDeseni, d.basDeseni, d.sinir]);
// Konum ve raf tek listede: raf satırında rafTuru doludur, konum satırında ad ve satır sayısı. Raf tablosu küçüktür, dizin istemez.
export interface KonumKaydi { id: number; kod: string; ad: string | null; satirSayisi: number; rafTuru: 'palet' | 'celik' | 'konsol' | 'zemin' | null }
export const konumKayitAra = (db: Db, d: AramaDesenleri): Promise<KonumKaydi[]> => db.sorgu(
  `(SELECT k.id, k.kod, k.ad, (SELECT count(*)::int FROM stok_bakiye b WHERE b.konum_id = k.id) AS "satirSayisi", NULL::text AS "rafTuru"
    FROM stok_konum k WHERE k.aktif AND (public.arama_sade(k.kod) LIKE $2 OR public.arama_sade(k.ad) LIKE $2)
    ORDER BY (public.arama_sade(k.kod) = $1) DESC, (public.arama_sade(k.kod) LIKE $3) DESC, k.kod LIMIT $4)
   UNION ALL
   (SELECT r.id, r.kod, NULL, 0, r.tur FROM stok_raf r WHERE r.aktif AND (public.arama_sade(r.kod) LIKE $2 OR public.arama_sade('RAF ' || r.kod) LIKE $2)
    ORDER BY (public.arama_sade(r.kod) = $1) DESC, (public.arama_sade(r.kod) LIKE $3) DESC, r.kod LIMIT $4)`, [d.sade, d.icindeDeseni, d.basDeseni, d.sinir]);

// Sayım bekleyen dolu konum: hiç sayılmamış ya da son sayımı süreden eski (DEP-15, STK-9 a).
export const sayimBekleyenGozler = (db: Db, gun: number): Promise<{ konumId: number; kod: string; sonSayim: string | null }[]> => db.sorgu(
  `SELECT k.id AS "konumId", k.kod, ${zamanMetni('k.son_sayim')} AS "sonSayim" FROM stok_konum k
   WHERE k.tur <> ALL($2::text[]) AND k.aktif AND EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.konum_id = k.id)
     AND (k.son_sayim IS NULL OR k.son_sayim < now() - make_interval(days => $1::int))
   ORDER BY k.son_sayim NULLS FIRST, k.kod LIMIT 200`, [gun, SAYIM_DISI_KONUMLAR]);

// Kart #1124: sipariş satırlarına bağlı mal kabul belgeleri; düzeltilmiş (yerine yenisi gelmiş) belge listede yoktur.
export const siparisIrsaliyeleri = (db: Db, siparisSatirIdler: readonly number[]): Promise<{ siparisSatirId: number; malKabulId: number; malKabulNo: string; irsaliyeNo: string | null; zaman: string }[]> => db.sorgu(
  `SELECT DISTINCT s.siparis_satir_id AS "siparisSatirId", m.id AS "malKabulId", m.no AS "malKabulNo", m.irsaliye_no AS "irsaliyeNo", ${zamanMetni('m.zaman')} AS zaman
     FROM stok_mal_kabul_satiri s JOIN stok_mal_kabul m ON m.id = s.mal_kabul_id
    WHERE s.siparis_satir_id = ANY($1::int[]) AND NOT EXISTS (SELECT 1 FROM stok_mal_kabul d WHERE d.duzeltilen_id = m.id)
    ORDER BY zaman, "malKabulId"`, [siparisSatirIdler]);
