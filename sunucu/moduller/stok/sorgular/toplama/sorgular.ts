import type { Db } from '#cekirdek/db.ts';
import type { Dilim, SiralamaIstegi } from '#cekirdek/liste.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { MalzemeIstegiDurumu } from '#paylasilan/sozlesme/stok.ts';
import { HAREKET_BAGLARI, HAREKET_SECIMI } from '../ortak/sorgular.ts';
import type { HareketHam } from '../depo/sorgular.ts';

// ---- Sepet ve fiş ----------------------------------------------------------------------------------------------------------
export interface SepetHam {
  id: number; malzemeId: number; kaynakKonumId: number | null; kaynakKonumKod: string | null; partiId: number | null; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; partiEmirId: number | null; miktar: string; eklenme: string;
  refakatPartisiId: number | null; hedefKonumId: number | null; hedefKonumKod: string | null; hedefKonumAd: string | null; hedefIstasyonId: number | null;
}
const SEPET_SECIMI = `SELECT s.id, s.malzeme_id AS "malzemeId", s.kaynak_konum_id AS "kaynakKonumId", k.kod AS "kaynakKonumKod", s.parti_id AS "partiId",
  p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.uretim_emri_id AS "partiEmirId", s.miktar, ${zamanMetni('s.eklenme')} AS eklenme,
  s.refakat_partisi_id AS "refakatPartisiId", s.hedef_konum_id AS "hedefKonumId", hk.kod AS "hedefKonumKod", hk.ad AS "hedefKonumAd", hk.istasyon_id AS "hedefIstasyonId"
  FROM stok_sepet_satiri s LEFT JOIN stok_konum k ON k.id = s.kaynak_konum_id LEFT JOIN stok_parti p ON p.id = s.parti_id LEFT JOIN stok_konum hk ON hk.id = s.hedef_konum_id`;
export const sepetSatirlari = (db: Db, kisiId: number, kilit = false): Promise<SepetHam[]> =>
  db.sorgu(`${SEPET_SECIMI} WHERE s.kisi_id = $1 ORDER BY s.id${kilit ? ' FOR UPDATE OF s' : ''}`, [kisiId]);
// Aynı satır yeniden eklenince miktar toplanır; yeni kart ve hedef verilmişse onlar geçer, verilmemişse eskisi kalır.
// `tavan` (lotlu satır): lotun gözdeki serbest miktarı. Aynı etiket ikinci kez okutulunca toplam bunu aşmaz (lot iki kez sayılmaz);
// satır zaten tavanın üstündeyse (stok sonradan azaldı) eski miktar kalır, bırakırken sunucu yeniden denetler. Boşsa sınır yok.
export const sepeteEkle = async (db: Db, s: {
  kisiId: number; malzemeId: number; kaynakKonumId: number | null; partiId: number | null; miktar: string; refakatPartisiId?: number | null; hedefKonumId?: number | null;
  tavan?: string | null;
}): Promise<number> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_sepet_satiri (kisi_id, malzeme_id, kaynak_konum_id, parti_id, miktar, refakat_partisi_id, hedef_konum_id) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ON CONSTRAINT stok_sepet_satiri_tek DO UPDATE SET miktar = CASE WHEN $8::numeric IS NULL THEN stok_sepet_satiri.miktar + EXCLUDED.miktar
         ELSE GREATEST(stok_sepet_satiri.miktar, LEAST(stok_sepet_satiri.miktar + EXCLUDED.miktar, $8::numeric)) END,
       refakat_partisi_id = COALESCE(EXCLUDED.refakat_partisi_id, stok_sepet_satiri.refakat_partisi_id),
       hedef_konum_id = COALESCE(EXCLUDED.hedef_konum_id, stok_sepet_satiri.hedef_konum_id) RETURNING id`,
    [s.kisiId, s.malzemeId, s.kaynakKonumId, s.partiId, s.miktar, s.refakatPartisiId ?? null, s.hedefKonumId ?? null, s.tavan ?? null],
  ))!.id;
export const sepetMiktari = (db: Db, id: number, kisiId: number, miktar: string): Promise<{ id: number } | null> =>
  db.tek('UPDATE stok_sepet_satiri SET miktar = $3 WHERE id = $1 AND kisi_id = $2 RETURNING id', [id, kisiId, miktar]);
export const sepettenSil = (db: Db, id: number, kisiId: number): Promise<{ id: number } | null> =>
  db.tek('DELETE FROM stok_sepet_satiri WHERE id = $1 AND kisi_id = $2 RETURNING id', [id, kisiId]);
export const sepetiBosalt = (db: Db, kisiId: number, idler: number[]): Promise<unknown[]> =>
  db.sorgu('DELETE FROM stok_sepet_satiri WHERE kisi_id = $1 AND id = ANY($2::bigint[]) RETURNING id', [kisiId, idler]);
export const fisAc = async (db: Db, f: { no: string; hedefKonumId: number | null; cikisNedeni: string | null; uretimEmriId: number | null; aciklama: string | null; kisiId: number }): Promise<number> =>
  (await db.tek<{ id: number }>('INSERT INTO stok_fis (no, hedef_konum_id, cikis_nedeni, uretim_emri_id, aciklama, kisi_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [f.no, f.hedefKonumId, f.cikisNedeni, f.uretimEmriId, f.aciklama, f.kisiId]))!.id;
export const fisSatiriYaz = (db: Db, fisId: number, hareketIdler: number[]): Promise<unknown[]> =>
  db.sorgu('INSERT INTO stok_fis_satiri (fis_id, hareket_id) SELECT $1, unnest($2::bigint[]) RETURNING hareket_id', [fisId, hareketIdler]);
export interface FisHam { id: number; no: string; zaman: string; hedefKonumId: number | null; hedefKonumKod: string | null; cikisNedeni: 'uretime_sarf' | 'sevk' | 'fire' | 'numune' | 'diger' | null; uretimEmriId: number | null; aciklama: string | null; kisiId: number; satirSayisi: number }
const FIS_SECIMI = `SELECT f.id, f.no, ${zamanMetni('f.zaman')} AS zaman, f.hedef_konum_id AS "hedefKonumId", k.kod AS "hedefKonumKod", f.cikis_nedeni AS "cikisNedeni",
  f.uretim_emri_id AS "uretimEmriId", f.aciklama, f.kisi_id AS "kisiId", (SELECT count(*)::int FROM stok_fis_satiri s WHERE s.fis_id = f.id) AS "satirSayisi"
  FROM stok_fis f LEFT JOIN stok_konum k ON k.id = f.hedef_konum_id`;
export const fisBul = (db: Db, id: number): Promise<FisHam | null> => db.tek(`${FIS_SECIMI} WHERE f.id = $1`, [id]);
export const FIS_SIRALAMASI: SiralamaTanimi<'zaman'> = { sutunlar: { zaman: 'f.zaman' }, ikincil: 'f.id', varsayilan: { sutun: 'f.zaman', yon: 'azalan' } };
export const fisSay = async (db: Db): Promise<number> => (await db.tek<{ toplam: number }>('SELECT count(*)::int AS toplam FROM stok_fis'))?.toplam ?? 0;
export const fisler = (db: Db, sira: SiralamaIstegi<'zaman'>, d: Dilim): Promise<FisHam[]> =>
  db.sorgu(`${FIS_SECIMI} ORDER BY ${siralamaSql(FIS_SIRALAMASI, sira)} LIMIT $1 OFFSET $2`, [d.sinir, d.atla]);
export const fisinHareketleri = (db: Db, fisId: number): Promise<HareketHam[]> =>
  db.sorgu(`${HAREKET_SECIMI} ${HAREKET_BAGLARI} WHERE h.id IN (SELECT hareket_id FROM stok_fis_satiri WHERE fis_id = $1) ORDER BY h.id`, [fisId]);

// ---- Toplama --------------------------------------------------------------------------------------------------------------
export const toplamaAc = async (db: Db, no: string, ad: string, kisiId: number): Promise<number> =>
  (await db.tek<{ id: number }>('INSERT INTO stok_toplama (no, ad, kisi_id) VALUES ($1, $2, $3) RETURNING id', [no, ad, kisiId]))!.id;
export const toplamaKalemiYaz = (db: Db, toplamaId: number, malzemeId: number, istenen: string, eksik: string): Promise<unknown[]> =>
  db.sorgu('INSERT INTO stok_toplama_kalemi (toplama_id, malzeme_id, istenen, eksik) VALUES ($1, $2, $3, $4) RETURNING toplama_id', [toplamaId, malzemeId, istenen, eksik]);
export const toplamaAdimiYaz = (db: Db, a: { toplamaId: number; sira: number; malzemeId: number; konumId: number; partiId: number | null; miktar: string }): Promise<unknown[]> =>
  db.sorgu('INSERT INTO stok_toplama_adimi (toplama_id, sira, malzeme_id, konum_id, parti_id, miktar) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [a.toplamaId, a.sira, a.malzemeId, a.konumId, a.partiId, a.miktar]);
export const konumRotaBilgisi = (db: Db, idler: number[]): Promise<{ id: number; kod: string; rafKod: string | null; bolmeNo: number | null; katNo: number | null }[]> =>
  db.sorgu('SELECT k.id, k.kod, r.kod AS "rafKod", k.bolme_no AS "bolmeNo", k.kat_no AS "katNo" FROM stok_konum k LEFT JOIN stok_raf r ON r.id = k.raf_id WHERE k.id = ANY($1::int[])', [idler]);
export interface ToplamaHam { id: number; no: string; ad: string; durum: 'topluyor' | 'bitti' | 'iptal'; acilis: string; kapanis: string | null; kisiId: number; kapatanKisiId: number | null; adimSayisi: number; toplanan: number; eksikVar: boolean; surum: number }
const TOPLAMA_SECIMI = `SELECT t.id, t.no, t.ad, t.durum, ${zamanMetni('t.acilis')} AS acilis, ${zamanMetni('t.kapanis')} AS kapanis, t.kisi_id AS "kisiId", t.kapatan_kisi_id AS "kapatanKisiId", t.surum,
  (SELECT count(*)::int FROM stok_toplama_adimi a WHERE a.toplama_id = t.id) AS "adimSayisi",
  (SELECT count(*)::int FROM stok_toplama_adimi a WHERE a.toplama_id = t.id AND a.hareket_id IS NOT NULL) AS toplanan,
  EXISTS (SELECT 1 FROM stok_toplama_kalemi k WHERE k.toplama_id = t.id AND k.eksik > 0) AS "eksikVar"
  FROM stok_toplama t`;
export const toplamaBul = (db: Db, id: number, kilit = false): Promise<ToplamaHam | null> => db.tek(`${TOPLAMA_SECIMI} WHERE t.id = $1${kilit ? ' FOR UPDATE OF t' : ''}`, [id]);
export const TOPLAMA_SIRALAMASI: SiralamaTanimi<'acilis'> = { sutunlar: { acilis: 't.acilis' }, ikincil: 't.id', varsayilan: { sutun: 't.acilis', yon: 'azalan' } };
// Kapsam süzgeci: istasyonlar null ise sınırsız; değilse teslim yeri kapsam dışı bir istasyon olan liste çıkar. Teslim yeri istasyon olmayan liste süzülmez.
const TOPLAMA_KAPSAMI = (n: number): string => `($${n}::int[] IS NULL OR NOT EXISTS (SELECT 1 FROM stok_toplama_hedefi th JOIN stok_konum tk ON tk.id = th.konum_id
  WHERE th.toplama_id = t.id AND tk.istasyon_id IS NOT NULL AND tk.istasyon_id <> ALL($${n}::int[])))`;
export const toplamaSay = async (db: Db, durum: string | undefined, istasyonlar: number[] | null = null): Promise<number> =>
  (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM stok_toplama t WHERE ($1::text IS NULL OR t.durum = $1) AND ${TOPLAMA_KAPSAMI(2)}`, [durum ?? null, istasyonlar]))?.toplam ?? 0;
export const toplamalar = (db: Db, durum: string | undefined, sira: SiralamaIstegi<'acilis'>, d: Dilim, istasyonlar: number[] | null = null): Promise<ToplamaHam[]> =>
  db.sorgu(`${TOPLAMA_SECIMI} WHERE ($1::text IS NULL OR t.durum = $1) AND ${TOPLAMA_KAPSAMI(4)} ORDER BY ${siralamaSql(TOPLAMA_SIRALAMASI, sira)} LIMIT $2 OFFSET $3`, [durum ?? null, d.sinir, d.atla, istasyonlar]);
export const toplamaKalemleri = (db: Db, id: number): Promise<{ malzemeId: number; istenen: string; eksik: string }[]> =>
  db.sorgu('SELECT malzeme_id AS "malzemeId", istenen, eksik FROM stok_toplama_kalemi WHERE toplama_id = $1 ORDER BY malzeme_id', [id]);
export interface AdimHam { id: number; sira: number; malzemeId: number; konumId: number; konumKod: string; partiId: number | null; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; partiEmirId: number | null; miktar: string; hareketId: number | null; toplanan: string | null }
// Toplanan, adımın yazdığı hareketin miktarıdır (kısmi toplamada planlanandan azdır).
export const toplamaAdimlari = (db: Db, id: number): Promise<AdimHam[]> => db.sorgu(
  `SELECT a.id, a.sira, a.malzeme_id AS "malzemeId", a.konum_id AS "konumId", k.kod AS "konumKod", a.parti_id AS "partiId", p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo",
     p.dokum_no AS "dokumNo", p.uretim_emri_id AS "partiEmirId", a.miktar, a.hareket_id AS "hareketId", h.miktar AS toplanan
   FROM stok_toplama_adimi a JOIN stok_konum k ON k.id = a.konum_id LEFT JOIN stok_parti p ON p.id = a.parti_id LEFT JOIN stok_hareketi h ON h.id = a.hareket_id
   WHERE a.toplama_id = $1 ORDER BY a.sira`, [id]);
export const adimBul = (db: Db, toplamaId: number, adimId: number): Promise<{ id: number; malzemeId: number; konumId: number; partiId: number | null; miktar: string; hareketId: number | null } | null> =>
  db.tek('SELECT id, malzeme_id AS "malzemeId", konum_id AS "konumId", parti_id AS "partiId", miktar, hareket_id AS "hareketId" FROM stok_toplama_adimi WHERE id = $1 AND toplama_id = $2 FOR UPDATE', [adimId, toplamaId]);
export const adimToplandi = (db: Db, adimId: number, hareketId: number): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_toplama_adimi SET hareket_id = $2 WHERE id = $1 AND hareket_id IS NULL RETURNING id', [adimId, hareketId]);
export const toplamaSurumu = (db: Db, id: number, surum: number): Promise<{ id: number } | null> =>
  db.tek("UPDATE stok_toplama SET surum = surum + 1 WHERE id = $1 AND surum = $2 AND durum = 'topluyor' RETURNING id", [id, surum]);
export const toplamaKapat = (db: Db, id: number, surum: number, durum: string, kisiId: number): Promise<{ id: number } | null> =>
  db.tek("UPDATE stok_toplama SET durum = $3, kapanis = now(), kapatan_kisi_id = $4, surum = surum + 1 WHERE id = $1 AND surum = $2 AND durum = 'topluyor' RETURNING id", [id, surum, durum, kisiId]);
export const toplamaVarMi = async (db: Db, id: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_toplama WHERE id = $1', [id])) !== null;
export const toplamaHedefiYaz = (db: Db, toplamaId: number, konumId: number): Promise<unknown[]> =>
  db.sorgu('INSERT INTO stok_toplama_hedefi (toplama_id, konum_id) VALUES ($1, $2) RETURNING toplama_id', [toplamaId, konumId]);
export const konumIstasyonu = async (db: Db, konumId: number): Promise<number | null> =>
  (await db.tek<{ istasyonId: number | null }>('SELECT istasyon_id AS "istasyonId" FROM stok_konum WHERE id = $1', [konumId]))?.istasyonId ?? null;
export const toplamaHedefi = (db: Db, toplamaId: number): Promise<{ konumId: number; kod: string; ad: string | null; istasyonId: number | null } | null> =>
  db.tek(`SELECT k.id AS "konumId", k.kod, k.ad, k.istasyon_id AS "istasyonId" FROM stok_toplama_hedefi h JOIN stok_konum k ON k.id = h.konum_id WHERE h.toplama_id = $1`, [toplamaId]);
// İstek başka bir listedeyse satır yazılmaz; çağıran boş dönüşü çakışma sayar.
export const toplamaIstegiBagla = async (db: Db, toplamaId: number, istekId: number): Promise<boolean> =>
  (await db.sorgu('INSERT INTO stok_toplama_istegi (istek_id, toplama_id) VALUES ($1, $2) ON CONFLICT (istek_id) DO NOTHING RETURNING istek_id', [istekId, toplamaId])).length > 0;
export const toplamaIstekBaglariniSil = (db: Db, toplamaId: number): Promise<unknown[]> =>
  db.sorgu('DELETE FROM stok_toplama_istegi WHERE toplama_id = $1 RETURNING istek_id', [toplamaId]);
export const toplamaIstekBaginiSil = (db: Db, istekId: number): Promise<unknown[]> =>
  db.sorgu('DELETE FROM stok_toplama_istegi WHERE istek_id = $1 RETURNING istek_id', [istekId]);

// ---- Malzeme isteği ----------------------------------------------------------------------------------------------------------
export interface IstekHam {
  id: number; no: string; kaynakKimligi: string; malzemeId: number; miktar: string; karsilanan: string | null; istasyonId: number | null; uretimEmriId: number | null;
  aciklama: string | null; durum: MalzemeIstegiDurumu; acilis: string; guncelleme: string; kisiId: number; kapatanKisiId: number | null; surum: number;
  toplamaId: number | null; toplamaNo: string | null; toplamaDurumu: 'topluyor' | 'bitti' | 'iptal' | null; kaynakIstasyonId: number | null; redNedeni: string | null;
}
const ISTEK_SECIMI = `SELECT i.id, i.no, i.kaynak_kimligi AS "kaynakKimligi", i.malzeme_id AS "malzemeId", i.miktar, i.karsilanan, i.istasyon_id AS "istasyonId",
  i.uretim_emri_id AS "uretimEmriId", i.aciklama, i.durum, ${zamanMetni('i.acilis')} AS acilis, ${zamanMetni('i.guncelleme')} AS guncelleme,
  i.kisi_id AS "kisiId", i.kapatan_kisi_id AS "kapatanKisiId", i.surum, tl.id AS "toplamaId", tl.no AS "toplamaNo", tl.durum AS "toplamaDurumu",
  i.kaynak_istasyon_id AS "kaynakIstasyonId", i.red_nedeni AS "redNedeni"
  FROM stok_malzeme_istegi i LEFT JOIN stok_toplama_istegi ti ON ti.istek_id = i.id LEFT JOIN stok_toplama tl ON tl.id = ti.toplama_id`;
export const toplamaIstekleri = (db: Db, toplamaId: number, kilit = false): Promise<IstekHam[]> =>
  db.sorgu(`${ISTEK_SECIMI} WHERE ti.toplama_id = $1 ORDER BY i.acilis, i.id${kilit ? ' FOR UPDATE OF i' : ''}`, [toplamaId]);
// Aynı isteğe ikinci teslim açılmasın: yolda olan teslim varken istek yeniden gönderilmez.
export const yoldaTeslimleri = (db: Db, istekIdler: number[]): Promise<{ istekId: number; id: number; no: string }[]> =>
  (istekIdler.length === 0 ? Promise.resolve([])
    : db.sorgu(`SELECT DISTINCT ON (istek_id) istek_id AS "istekId", id, no FROM stok_teslim WHERE istek_id = ANY($1::int[]) AND durum = 'yolda' ORDER BY istek_id, id`, [istekIdler]));
export const yoldaTeslimVarMi = async (db: Db, istekId: number): Promise<boolean> =>
  (await db.tek("SELECT 1 FROM stok_teslim WHERE istek_id = $1 AND durum = 'yolda' LIMIT 1", [istekId])) !== null;
// 1229 a: bölünen istekli teslimin parçaları: yolda kalan var mı ve alınanların toplamı.
export const istegeTeslimler = async (db: Db, istekId: number): Promise<{ yolda: boolean; alinan: string }> =>
  (await db.tek<{ yolda: boolean; alinan: string }>(
    `SELECT bool_or(durum = 'yolda') IS TRUE AS yolda, COALESCE(sum(alinan) FILTER (WHERE durum = 'teslim'), 0)::text AS alinan FROM stok_teslim WHERE istek_id = $1`, [istekId]))!;
// Aynı kaynak kimliğiyle eşzamanlı ikinci açılış ilkinin bitmesini bekler ve satır döndürmez; çağıran ilk kaydı okur.
export const istekAc = async (db: Db, i: {
  no: string; kaynakKimligi: string; malzemeId: number; miktar: string; istasyonId: number | null; uretimEmriId: number | null; aciklama: string | null; kisiId: number;
  durum?: 'acik' | 'stok_yok'; kaynakIstasyonId?: number | null;
}): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_malzeme_istegi (no, kaynak_kimligi, malzeme_id, miktar, istasyon_id, uretim_emri_id, aciklama, kisi_id, durum, kaynak_istasyon_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT ON CONSTRAINT stok_malzeme_istegi_kaynak_tek DO NOTHING RETURNING id`,
    [i.no, i.kaynakKimligi, i.malzemeId, i.miktar, i.istasyonId, i.uretimEmriId, i.aciklama, i.kisiId, i.durum ?? 'acik', i.kaynakIstasyonId ?? null]))?.id ?? null;
// Emrin açık istekleri (kart #1413): emir kapanınca kilitlenip iptal edilir.
export const emrinAcikIstekleri = (db: Db, uretimEmriId: number): Promise<IstekHam[]> =>
  db.sorgu(`${ISTEK_SECIMI} WHERE i.uretim_emri_id = $1 AND i.durum IN ('acik', 'stok_yok', 'hazirlaniyor') ORDER BY i.id FOR UPDATE OF i`, [uretimEmriId]);
// Emri kapanan yoldaki teslime uyarı yazılır; sürüm artmaz (alan ya da gönderen elindeki sürümle karar verir), uyarı bir kez yazılır.
export const emrinYoldakiTeslimlerineYaz = (db: Db, uretimEmriId: number, not: string): Promise<unknown> =>
  db.sorgu(`UPDATE stok_teslim SET aciklama = left($2 || coalesce(' · ' || aciklama, ''), 200)
    WHERE uretim_emri_id = $1 AND durum = 'yolda' AND (aciklama IS NULL OR aciklama NOT LIKE $2 || '%')`, [uretimEmriId, not]);
export const istekBul = (db: Db, id: number, kilit = false): Promise<IstekHam | null> => db.tek(`${ISTEK_SECIMI} WHERE i.id = $1${kilit ? ' FOR UPDATE OF i' : ''}`, [id]);
// Aynı kökten açılmış istekler, en yenisi önce (üretim hazırlığı isteği kapandıktan sonra yeniden açar, kart #1289).
export const istekleriKoktan = (db: Db, kok: string): Promise<IstekHam[]> =>
  db.sorgu(`${ISTEK_SECIMI} WHERE i.kaynak_kimligi LIKE $1 || '%' ORDER BY i.id DESC`, [kok]);
export const istekleriKaynaktan = (db: Db, kaynakKimlikleri: string[]): Promise<IstekHam[]> => db.sorgu(`${ISTEK_SECIMI} WHERE i.kaynak_kimligi = ANY($1::text[])`, [kaynakKimlikleri]);
export const ISTEK_SIRALAMASI: SiralamaTanimi<'acilis'> = { sutunlar: { acilis: 'i.acilis' }, ikincil: 'i.id', varsayilan: { sutun: 'i.acilis', yon: 'azalan' } };
// Kapsam süzgeci: istasyonlar null ise sınırsız; değilse istasyonu kapsam dışı olan istek çıkar. İstasyonsuz istek süzülmez.
// Bu süzgeç depo listeleri ve sayaçlarınındır: istasyondan istenen istek (soru 96 a) depoya düşmez, o istasyon karşılar.
const ISTEK_KAPSAMI = (n: number): string => `i.kaynak_istasyon_id IS NULL AND ($${n}::int[] IS NULL OR i.istasyon_id IS NULL OR i.istasyon_id = ANY($${n}::int[]))`;
export const istekSay = async (db: Db, durum: string | undefined, istasyonlar: number[] | null = null): Promise<number> =>
  (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM stok_malzeme_istegi i WHERE ($1::text IS NULL OR i.durum = $1) AND ${ISTEK_KAPSAMI(2)}`, [durum ?? null, istasyonlar]))?.toplam ?? 0;
export const istekler = (db: Db, durum: string | undefined, sira: SiralamaIstegi<'acilis'>, d: Dilim, istasyonlar: number[] | null = null): Promise<IstekHam[]> =>
  db.sorgu(`${ISTEK_SECIMI} WHERE ($1::text IS NULL OR i.durum = $1) AND ${ISTEK_KAPSAMI(4)} ORDER BY ${siralamaSql(ISTEK_SIRALAMASI, sira)} LIMIT $2 OFFSET $3`, [durum ?? null, d.sinir, d.atla, istasyonlar]);
// Geçiş yalnız izinli kaynak durumdan yapılır; kapanışta kapatan kişi ve (teslimde) karşılanan yazılır.
export const istekGecir = (db: Db, id: number, surum: number, g: { kaynaklar: readonly string[]; durum: MalzemeIstegiDurumu; karsilanan: string | null; kapatanKisiId: number | null }): Promise<{ id: number } | null> =>
  db.tek(
    `UPDATE stok_malzeme_istegi SET durum = $3, karsilanan = $4, kapatan_kisi_id = $5, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 AND durum = ANY($6::text[]) RETURNING id`,
    [id, surum, g.durum, g.karsilanan, g.kapatanKisiId, g.kaynaklar]);
export const acikIstekSayisi = async (db: Db, istasyonlar: number[] | null = null): Promise<number> =>
  (await db.tek<{ n: number }>(`SELECT count(*)::int AS n FROM stok_malzeme_istegi i WHERE i.durum IN ('acik', 'stok_yok', 'hazirlaniyor') AND ${ISTEK_KAPSAMI(1)}`, [istasyonlar]))?.n ?? 0;
export const teslimBekleyenIstekSayisi = async (db: Db, istasyonlar: number[] | null): Promise<number> =>
  (await db.tek<{ n: number }>(`SELECT count(*)::int AS n FROM stok_malzeme_istegi i WHERE i.durum IN ('acik', 'stok_yok') AND ${ISTEK_KAPSAMI(1)}
    AND NOT EXISTS (SELECT 1 FROM stok_teslim t WHERE t.istek_id = i.id AND t.durum = 'yolda')`, [istasyonlar]))?.n ?? 0;
// Depoya gelen, onay bekleyen teslimler (iade ve istasyondan geri gönderilen dahil); Teslim al'daki depo satırlarıyla aynı koşul.
export const depoyaGelenTeslimSayisi = async (db: Db): Promise<number> =>
  (await db.tek<{ n: number }>(`SELECT count(*)::int AS n FROM stok_teslim t JOIN stok_konum h ON h.id = t.hedef_konum_id WHERE t.durum = 'yolda' AND h.istasyon_id IS NULL`))?.n ?? 0;
// Stokta karşılanamayan açık istekler, en eski önce (satın alma okur).
export interface StokYokIstegiHam { id: number; no: string; malzemeId: number; miktar: string; uretimEmriId: number | null; istasyonId: number | null; acilis: string; guncelleme: string }
export const stokYokIstekleri = (db: Db, sinir: number): Promise<StokYokIstegiHam[]> =>
  db.sorgu(`SELECT i.id, i.no, i.malzeme_id AS "malzemeId", i.miktar, i.uretim_emri_id AS "uretimEmriId", i.istasyon_id AS "istasyonId",
    ${zamanMetni('i.acilis')} AS acilis, ${zamanMetni('i.guncelleme')} AS guncelleme
    FROM stok_malzeme_istegi i WHERE i.durum = 'stok_yok' ORDER BY i.acilis, i.id LIMIT $1`, [sinir]);
export const istekVarMi = async (db: Db, id: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_malzeme_istegi WHERE id = $1', [id])) !== null;

// Benden istenenler (soru 96 a): kaynağı verilen istasyonlardan biri olan açık istekler, en eski önce; null ise bütün istasyonlar.
export const istasyondanIstenenler = (db: Db, istasyonlar: number[] | null): Promise<IstekHam[]> =>
  db.sorgu(`${ISTEK_SECIMI} WHERE i.kaynak_istasyon_id IS NOT NULL AND ($1::int[] IS NULL OR i.kaynak_istasyon_id = ANY($1::int[]))
    AND i.durum IN ('acik', 'stok_yok') ORDER BY i.acilis, i.id LIMIT 50`, [istasyonlar]);
// İstasyondan istenen isteğin reddi: neden yazılır, istek iptal olur.
export const istekReddet = (db: Db, id: number, surum: number, k: { neden: string; kisiId: number }): Promise<{ id: number } | null> =>
  db.tek(
    `UPDATE stok_malzeme_istegi SET durum = 'iptal', red_nedeni = $3, kapatan_kisi_id = $4, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 AND durum IN ('acik', 'stok_yok') AND kaynak_istasyon_id IS NOT NULL RETURNING id`,
    [id, surum, k.neden, k.kisiId]);

// Kişinin istekleri: açık olanların hepsi, kapananlardan son 30 gün.
export const isteklerim = (db: Db, kisiId: number): Promise<IstekHam[]> =>
  db.sorgu(`${ISTEK_SECIMI} WHERE i.kisi_id = $1 AND (i.durum NOT IN ('teslim', 'iptal') OR i.guncelleme > now() - interval '30 days')
    ORDER BY i.acilis DESC, i.id DESC LIMIT 50`, [kisiId]);
// Kök başına aynı kökten açılmış istekler, en yenisi önce (istekleriKoktan ile aynı).
export const istekleriKoklerden = async (db: Db, kokler: readonly string[]): Promise<Map<string, IstekHam[]>> => {
  const tekil = [...new Set(kokler)];
  const sonuc = new Map<string, IstekHam[]>(tekil.map((k) => [k, []]));
  if (tekil.length === 0) return sonuc;
  const satirlar = await db.sorgu<IstekHam & { kok: string }>(
    `SELECT x.*, k.kok FROM unnest($1::text[]) AS k(kok) CROSS JOIN LATERAL (${ISTEK_SECIMI} WHERE i.kaynak_kimligi LIKE k.kok || '%' ORDER BY i.id DESC) x
      ORDER BY k.kok, x.id DESC`, [tekil]);
  for (const { kok, ...x } of satirlar) sonuc.get(kok)!.push(x);
  return sonuc;
};
