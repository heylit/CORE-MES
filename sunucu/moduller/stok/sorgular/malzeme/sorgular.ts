import type { Db } from '#cekirdek/db.ts';
import type { Dilim, SiralamaIstegi } from '#cekirdek/liste.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { EMIRSIZ_CIKIS_NEDENLERI, KULLANILABILIR_KONUM_TURLERI, type DegerGrubu } from '../../kurallar.ts';
import { malzemeKartiIzParametreleri, type MalzemeKartiAnahtari, type MalzemeKartiIzi } from '#paylasilan/malzeme-karti-izi.ts';
import { KULLANILABILIR_SQL, MAL_KABUL_SECIMI, S, icinde, malzemeKaynagi } from '../ortak/sorgular.ts';
import type { MalKabulHam } from '../depo/sorgular.ts';
import type { MalzemeSiralamaAlani } from '#paylasilan/sozlesme/stok.ts';

// ---- Malzeme gözüyle stok ----------------------------------------------------------------------------------------------------
// serbest: statüsüz bakiye (kritik seviye ona göre); statülü miktar üretimdeki yarı parçadır, kullanılabilir stok sayılmaz.
// statude: yalnız statü kimliği dolu bakiye; karantina ya da kabuldeki statüsüz miktar statüde sayılmaz.
export interface MalzemeStokHam {
  malzemeId: number; toplam: string; serbest: string; statude: string; kritikSeviye: string | null; konumSayisi: number; konumlar: { kod: string; katNo: number | null; miktar: string }[];
  varsayilanKonum: string | null; sonHareket: string | null;
}
// adlaBulunan: metnin ad ya da stok koduyla eşleştiği kartlar (malzemeler `malzemeAra`); kart tablosu stokun değil.
// statuIdleri: metnin adıyla eşleştiği statüler; o statüde bakiyesi olan malzeme bulunur.
// statuluKartlar: tanımlı statüsü olan kartlar (statü Reçete ve Rota'nın); bakiyesi ve ayarı olmasa da listeye girer. Metin varken
// yalnız metne uyan statülerin kartlarıdır (metin süzgecini de geçer).
export interface MalzemeSuzgeci {
  durum?: 'kritik' | 'eksi' | 'kabulde' | 'statulu' | undefined; metin?: string | undefined; adlaBulunan?: number[] | undefined;
  statuIdleri?: number[] | undefined; statuluKartlar?: number[] | undefined;
}
// Konum başına tek etiket: aynı konumdaki parti, statü ve kalite satırları toplanır (konum sayısıyla aynı kırılım).
const KONUM_ETIKETLERI = (malzeme: string): string => `COALESCE((SELECT json_agg(json_build_object('kod', x.kod, 'katNo', x.kat_no, 'miktar', x.miktar::text) ORDER BY x.miktar DESC, x.kod)
  FROM (SELECT k.kod, k.kat_no, sum(b.miktar) AS miktar FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE b.malzeme_id = ${malzeme}
        GROUP BY k.id, k.kod, k.kat_no ORDER BY sum(b.miktar) DESC, k.kod LIMIT 3) x), '[]'::json)`;
// Son hareket: kartın en büyük kimlikli hareketinin zamanı (stok_hareketi_malzeme_idx ile tek dizin okuması). Hareket zamanı
// yazılırken sunucudan alınır; kimlik sırası zaman sırasıdır.
const SON_HAREKET = (malzeme: string): string => `(SELECT h.zaman FROM stok_hareketi h WHERE h.malzeme_id = ${malzeme} ORDER BY h.id DESC LIMIT 1)`;
const VARSAYILAN_KONUM = (malzeme: string): string => `(SELECT vk.kod FROM stok_malzeme_ayari va JOIN stok_konum vk ON vk.id = va.varsayilan_konum_id WHERE va.malzeme_id = ${malzeme})`;
const TABLO_ALANLARI = (malzeme: string): string => `${VARSAYILAN_KONUM(malzeme)} AS "varsayilanKonum", ${zamanMetni(SON_HAREKET(malzeme))} AS "sonHareket"`;
const malzemeSuzgeci = (s: MalzemeSuzgeci) => ({
  sql: `${malzemeKaynagi(' UNION SELECT unnest($5::int[])')} WHERE ($1::text IS NULL OR ($1 = 'kritik' AND a.kritik_seviye IS NOT NULL AND t.serbest <= a.kritik_seviye)
        OR ($1 = 'eksi' AND t.eksi) OR ($1 = 'kabulde' AND t.kabulde) OR ($1 = 'statulu' AND (t.statulu OR m.malzeme_id = ANY($5::int[]))))
        AND ($2::text IS NULL OR m.malzeme_id::text = $2 OR m.malzeme_id = ANY($3::int[]) OR m.malzeme_id = ANY($5::int[])
          OR EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.malzeme_id = m.malzeme_id AND b.statu_id = ANY($4::int[]) AND b.miktar <> 0)
          OR EXISTS (SELECT 1 FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
          LEFT JOIN stok_parti p ON p.id = b.parti_id WHERE b.malzeme_id = m.malzeme_id
          AND (${S('k.kod')} LIKE $6 OR ${S('p.lot_no')} LIKE $6 OR ${S('p.tedarikci_parti_no')} LIKE $6 OR ${S('p.dokum_no')} LIKE $6)))`,
  p: [s.durum ?? null, s.metin ?? null, s.adlaBulunan ?? [], s.statuIdleri ?? [], s.statuluKartlar ?? [], icinde(s.metin)],
});
export const MALZEME_SIRALAMASI: SiralamaTanimi<MalzemeSiralamaAlani> = {
  sutunlar: { malzeme: 'm.malzeme_id', toplam: 't.toplam', serbest: 't.serbest', kritik: 'a.kritik_seviye', son: SON_HAREKET('m.malzeme_id') }, ikincil: 'm.malzeme_id',
};
export async function malzemeSay(db: Db, s: MalzemeSuzgeci): Promise<number> {
  const f = malzemeSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${f.sql}`, f.p))?.toplam ?? 0;
}
export function malzemeStoklari(db: Db, s: MalzemeSuzgeci, sira: SiralamaIstegi<MalzemeSiralamaAlani>, d: Dilim): Promise<MalzemeStokHam[]> {
  const f = malzemeSuzgeci(s);
  return db.sorgu(
    `SELECT m.malzeme_id AS "malzemeId", t.toplam::text AS toplam, t.serbest::text AS serbest, t.statude::text AS statude, a.kritik_seviye AS "kritikSeviye", t.konumlar AS "konumSayisi",
       ${KONUM_ETIKETLERI('m.malzeme_id')} AS konumlar, ${TABLO_ALANLARI('m.malzeme_id')} ${f.sql}
     ORDER BY ${siralamaSql(MALZEME_SIRALAMASI, sira)} LIMIT $7 OFFSET $8`, [...f.p, d.sinir, d.atla]);
}
export const kartStoklari = (db: Db, idler: readonly number[]): Promise<MalzemeStokHam[]> => db.sorgu(
  `SELECT m.id AS "malzemeId", COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = m.id), 0)::text AS toplam,
     COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = m.id AND statu_id IS NULL AND ${KULLANILABILIR_SQL}), 0)::text AS serbest,
     COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = m.id AND statu_id IS NOT NULL), 0)::text AS statude,
     (SELECT kritik_seviye FROM stok_malzeme_ayari WHERE malzeme_id = m.id) AS "kritikSeviye",
     (SELECT count(DISTINCT konum_id)::int FROM stok_bakiye WHERE malzeme_id = m.id) AS "konumSayisi",
     ${KONUM_ETIKETLERI('m.id')} AS konumlar, ${TABLO_ALANLARI('m.id')}
   FROM unnest($1::int[]) WITH ORDINALITY AS m(id, sira) ORDER BY m.sira`, [idler]);
export const malzemeStoku = (db: Db, malzemeId: number): Promise<MalzemeStokHam | null> => db.tek(
  `SELECT $1::int AS "malzemeId", COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = $1), 0)::text AS toplam,
     COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = $1 AND statu_id IS NULL AND ${KULLANILABILIR_SQL}), 0)::text AS serbest,
     COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = $1 AND statu_id IS NOT NULL), 0)::text AS statude,
     (SELECT kritik_seviye FROM stok_malzeme_ayari WHERE malzeme_id = $1) AS "kritikSeviye",
     (SELECT count(DISTINCT konum_id)::int FROM stok_bakiye WHERE malzeme_id = $1) AS "konumSayisi",
     ${KONUM_ETIKETLERI('$1')} AS konumlar, ${TABLO_ALANLARI('$1::int')}`, [malzemeId]);
export interface AyarHam {
  kritikSeviye: string | null; varsayilanAmbalajTur: 'kasa' | 'koli' | 'palet' | 'bidon' | 'makara' | null; varsayilanAmbalajOlcu: string | null;
  varsayilanKonumId: number | null; varsayilanKonumKod: string | null; surum: number;
}
export const malzemeAyari = (db: Db, malzemeId: number): Promise<AyarHam | null> => db.tek(
  `SELECT a.kritik_seviye AS "kritikSeviye", a.varsayilan_ambalaj_tur AS "varsayilanAmbalajTur", a.varsayilan_ambalaj_olcu AS "varsayilanAmbalajOlcu",
     a.varsayilan_konum_id AS "varsayilanKonumId", k.kod AS "varsayilanKonumKod", a.surum
   FROM stok_malzeme_ayari a LEFT JOIN stok_konum k ON k.id = a.varsayilan_konum_id WHERE a.malzeme_id = $1`, [malzemeId]);
export const malzemeAmbalajlari = (db: Db, malzemeId: number): Promise<{ tur: 'kasa' | 'koli' | 'palet' | 'bidon' | 'makara'; olcu: string; iciMiktar: string }[]> =>
  db.sorgu('SELECT ambalaj_tur AS tur, ambalaj_olcu AS olcu, ici_miktar AS "iciMiktar" FROM stok_malzeme_ambalaji WHERE malzeme_id = $1 ORDER BY ambalaj_tur, ambalaj_olcu', [malzemeId]);
export interface AyarAlanlari { kritikSeviye: string | null; ambalajTur: string | null; ambalajOlcu: string | null; konumId: number | null }
export const ayarAc = (db: Db, malzemeId: number, a: AyarAlanlari): Promise<{ malzemeId: number } | null> => db.tek(
  `INSERT INTO stok_malzeme_ayari (malzeme_id, kritik_seviye, varsayilan_ambalaj_tur, varsayilan_ambalaj_olcu, varsayilan_konum_id) VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (malzeme_id) DO NOTHING RETURNING malzeme_id AS "malzemeId"`, [malzemeId, a.kritikSeviye, a.ambalajTur, a.ambalajOlcu, a.konumId]);
export const ayarGuncelle = (db: Db, malzemeId: number, surum: number, a: AyarAlanlari): Promise<{ malzemeId: number } | null> => db.tek(
  `UPDATE stok_malzeme_ayari SET kritik_seviye = $3, varsayilan_ambalaj_tur = $4, varsayilan_ambalaj_olcu = $5, varsayilan_konum_id = $6, surum = surum + 1
   WHERE malzeme_id = $1 AND surum = $2 RETURNING malzeme_id AS "malzemeId"`, [malzemeId, surum, a.kritikSeviye, a.ambalajTur, a.ambalajOlcu, a.konumId]);
// DEP-59: varsayılan konum aktif bir konum olmalı (kilitli okunur: aynı anda pasife alınan konum yazılmasın).
export const konumAktifMi = async (db: Db, id: number): Promise<boolean> =>
  (await db.tek<{ aktif: boolean }>('SELECT aktif FROM stok_konum WHERE id = $1 FOR SHARE', [id]))?.aktif === true;
// DEP-60: kartın gösterdiği iki değer; yalnız biri dolu satırlar.
const KART_BILGISI_SUZGECI = 'FROM stok_malzeme_ayari a LEFT JOIN stok_konum k ON k.id = a.varsayilan_konum_id WHERE a.kritik_seviye IS NOT NULL OR a.varsayilan_konum_id IS NOT NULL';
export const kartBilgisiSay = async (db: Db): Promise<number> => (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${KART_BILGISI_SUZGECI}`))!.toplam;
export const kartBilgileri = (db: Db, d: Dilim): Promise<{ malzemeId: number; kritikSeviye: string | null; varsayilanKonum: string | null }[]> => db.sorgu(
  `SELECT a.malzeme_id AS "malzemeId", a.kritik_seviye AS "kritikSeviye", k.kod AS "varsayilanKonum" ${KART_BILGISI_SUZGECI} ORDER BY a.malzeme_id LIMIT $1 OFFSET $2`,
  [d.sinir, d.atla]);
export const ayarVarMi = async (db: Db, malzemeId: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_malzeme_ayari WHERE malzeme_id = $1', [malzemeId])) !== null;
export async function ambalajlariYaz(db: Db, malzemeId: number, liste: { tur: string; olcu: string; iciMiktar: string }[]): Promise<void> {
  await db.sorgu('DELETE FROM stok_malzeme_ambalaji WHERE malzeme_id = $1', [malzemeId]);
  if (liste.length === 0) return;
  await db.sorgu(
    `INSERT INTO stok_malzeme_ambalaji (malzeme_id, ambalaj_tur, ambalaj_olcu, ici_miktar) SELECT $1, t, o, m FROM unnest($2::text[], $3::text[], $4::numeric[]) AS x(t, o, m)`,
    [malzemeId, liste.map((a) => a.tur), liste.map((a) => a.olcu), liste.map((a) => a.iciMiktar)],
  );
}

// ---- Belge numarası ------------------------------------------------------------------------------------------------------------
export type BelgeTablosu = 'stok_mal_kabul' | 'stok_fis' | 'stok_toplama' | 'stok_malzeme_istegi' | 'stok_teslim';
export const belgeNoVarMi = async (db: Db, tablo: BelgeTablosu, no: string): Promise<boolean> =>
  (await db.tek(`SELECT 1 FROM ${tablo} WHERE no = $1`, [no])) !== null;

// ---- Mal kabul ------------------------------------------------------------------------------------------------------------------
// 1246: GKK satırı, giriş hareketi karantinaya karar bekliyor yazılmış satın alma satırıdır (fason dönüşü mal kabul girişi değildir).
const GKK_SATIRI = `EXISTS (SELECT 1 FROM stok_hareketi h WHERE h.id = s.hareket_id AND h.tur = 'giris' AND h.giris_kaynagi = 'mal_kabul'
  AND h.hedef_kalite_durumu = 'karar_bekliyor')`;
export interface GirisKontroluHam {
  id: number; malKabulNo: string; zaman: string; malzemeId: number; partiId: number; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null;
  siparisSatirId: number | null; miktar: string; bekleyen: string;
}
// Düzeltilmemiş belgelerin GKK satırları; `bekleyen` partinin karantinadaki karar bekleyen bakiyesi. Kimlik verilmezse yalnız bekleyeni olanlar.
export const girisKontroluSatirlari = (db: Db, idler: readonly number[] | null): Promise<GirisKontroluHam[]> => db.sorgu(
  `SELECT s.id, m.no AS "malKabulNo", ${zamanMetni('m.zaman')} AS zaman, s.malzeme_id AS "malzemeId", s.parti_id AS "partiId", p.lot_no AS "lotNo",
          p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", s.siparis_satir_id AS "siparisSatirId", s.sayilan_miktar::text AS miktar,
          COALESCE((SELECT sum(b.miktar) FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
                     WHERE b.parti_id = s.parti_id AND k.tur = 'karantina' AND b.kalite_durumu = 'karar_bekliyor'), 0)::text AS bekleyen
     FROM stok_mal_kabul_satiri s JOIN stok_mal_kabul m ON m.id = s.mal_kabul_id JOIN stok_parti p ON p.id = s.parti_id
    WHERE ${GKK_SATIRI} AND NOT EXISTS (SELECT 1 FROM stok_mal_kabul d WHERE d.duzeltilen_id = m.id)
      AND ($1::int[] IS NULL OR s.id = ANY($1::int[]))
      AND ($1::int[] IS NOT NULL OR EXISTS (SELECT 1 FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
            WHERE b.parti_id = s.parti_id AND k.tur = 'karantina' AND b.kalite_durumu = 'karar_bekliyor' AND b.miktar > 0))
    ORDER BY m.zaman, s.id`, [idler]);
export const malKabulAc = async (db: Db, b: { no: string; tur: string; irsaliyeNo: string | null; irsaliyeTarihi?: string | null; duzeltilenId: number | null; kisiId: number }): Promise<number> =>
  (await db.tek<{ id: number }>('INSERT INTO stok_mal_kabul (no, tur, irsaliye_no, irsaliye_tarihi, duzeltilen_id, kisi_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [b.no, b.tur, b.irsaliyeNo, b.irsaliyeTarihi ?? null, b.duzeltilenId, b.kisiId]))!.id;
export const malKabulBul = (db: Db, id: number, kilit = false): Promise<MalKabulHam | null> =>
  db.tek(`${MAL_KABUL_SECIMI} FROM stok_mal_kabul m WHERE m.id = $1${kilit ? ' FOR UPDATE OF m' : ''}`, [id]);
export const malKabulSatiriYaz = async (db: Db, s: {
  malKabulId: number; sira: number; malzemeId: number; miktar: string; partiId: number | null; konumId: number | null; hareketId: number | null; siparisSatirId: number | null;
  fasonCikisHareketId: number | null;
}): Promise<number> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_mal_kabul_satiri (mal_kabul_id, sira, malzeme_id, sayilan_miktar, parti_id, konum_id, hareket_id, siparis_satir_id, fason_cikis_hareket_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [s.malKabulId, s.sira, s.malzemeId, s.miktar, s.partiId, s.konumId, s.hareketId, s.siparisSatirId, s.fasonCikisHareketId],
  ))!.id;
export interface MalKabulSatirHam {
  id: number; siparisSatirId: number | null; sira: number; malzemeId: number; sayilanMiktar: string; partiId: number | null; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; partiEmirId: number | null;
  konumId: number | null; konumKod: string | null; hareketId: number | null; emirAdimi: boolean; gkk: boolean;
  fasonCikisHareketId: number | null; fasonMalzemeId: number | null; fasonMiktar: string | null; fasonKonumId: number | null; fasonKonumKod: string | null; logoDurumu: 'irsaliye_bekleniyor' | 'eslesti' | 'fark_var'; logoIrsaliyeSatirNo: number | null; logoIrsaliyeMiktari: string | null;
}
export const malKabulSatirlari = (db: Db, id: number): Promise<MalKabulSatirHam[]> => db.sorgu(
  `SELECT s.id, s.siparis_satir_id AS "siparisSatirId", s.sira, s.malzeme_id AS "malzemeId", s.sayilan_miktar AS "sayilanMiktar", s.parti_id AS "partiId", p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo",
     p.dokum_no AS "dokumNo", p.uretim_emri_id AS "partiEmirId", s.konum_id AS "konumId", k.kod AS "konumKod", s.hareket_id AS "hareketId",
     EXISTS (SELECT 1 FROM stok_hareketi h WHERE h.id = s.hareket_id AND h.giris_kaynagi IS DISTINCT FROM 'mal_kabul') AS "emirAdimi", ${GKK_SATIRI} AS gkk,
     s.fason_cikis_hareket_id AS "fasonCikisHareketId", f.malzeme_id AS "fasonMalzemeId", f.miktar::text AS "fasonMiktar", f.kaynak_konum_id AS "fasonKonumId", fk.kod AS "fasonKonumKod",
     s.logo_durumu AS "logoDurumu", s.logo_irsaliye_satir_no AS "logoIrsaliyeSatirNo", s.logo_irsaliye_miktari AS "logoIrsaliyeMiktari"
   FROM stok_mal_kabul_satiri s LEFT JOIN stok_konum k ON k.id = s.konum_id LEFT JOIN stok_parti p ON p.id = s.parti_id
     LEFT JOIN stok_hareketi f ON f.id = s.fason_cikis_hareket_id LEFT JOIN stok_konum fk ON fk.id = f.kaynak_konum_id
   WHERE s.mal_kabul_id = $1 ORDER BY s.sira`, [id]);
export interface MalKabulSuzgeci { asil?: boolean | undefined; tur?: string | undefined; logoDurumu?: string | undefined; baslangic?: string | undefined; bitis?: string | undefined; metin?: string | undefined }
const malKabulSuzgeci = (s: MalKabulSuzgeci) => ({
  sql: `FROM stok_mal_kabul m WHERE ($1::text IS NULL OR m.tur = $1)
        AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM stok_mal_kabul_satiri s WHERE s.mal_kabul_id = m.id AND s.logo_durumu = $2))
        AND ($3::timestamptz IS NULL OR m.zaman >= $3) AND ($4::timestamptz IS NULL OR m.zaman < $4)
        AND ($5::text IS NULL OR ${S('m.no')} LIKE $5 OR ${S('m.irsaliye_no')} LIKE $5) AND (NOT $6::boolean OR m.duzeltilen_id IS NULL)`,
  p: [s.tur ?? null, s.logoDurumu ?? null, s.baslangic ?? null, s.bitis ?? null, icinde(s.metin), s.asil === true],
});
export const MAL_KABUL_SIRALAMASI: SiralamaTanimi<'zaman' | 'no'> = { sutunlar: { zaman: 'm.zaman', no: 'm.id' }, ikincil: 'm.id', varsayilan: { sutun: 'm.zaman', yon: 'azalan' } };
export async function malKabulSay(db: Db, s: MalKabulSuzgeci): Promise<number> {
  const f = malKabulSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${f.sql}`, f.p))?.toplam ?? 0;
}
export function malKabuller(db: Db, s: MalKabulSuzgeci, sira: SiralamaIstegi<'zaman' | 'no'>, d: Dilim): Promise<MalKabulHam[]> {
  const f = malKabulSuzgeci(s);
  return db.sorgu(`${MAL_KABUL_SECIMI} ${f.sql} ORDER BY ${siralamaSql(MAL_KABUL_SIRALAMASI, sira)} LIMIT $7 OFFSET $8`, [...f.p, d.sinir, d.atla]);
}

// ---- Göz önerisi ve konumun raf ölçüsü -------------------------------------------------------------------------------
export const gozAdaylari = (db: Db, malzemeId: number): Promise<{ konumId: number; kod: string; katNo: number | null; bos: boolean; buMalzemeVar: boolean }[]> => db.sorgu(
  `SELECT k.id AS "konumId", k.kod, k.kat_no AS "katNo", NOT EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.konum_id = k.id) AS bos,
     EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.konum_id = k.id AND b.malzeme_id = $1 AND b.miktar > 0) AS "buMalzemeVar"
   FROM stok_konum k WHERE k.tur = 'raf_gozu' AND k.aktif ORDER BY k.kod`, [malzemeId]);
export const konumunRafOlcusu = (db: Db, konumId: number): Promise<{ tur: 'palet' | 'celik' | 'konsol' | 'zemin'; bolmeGenislikM: string; derinlikM: string; katAraligiM: string } | null> => db.tek(
  `SELECT r.tur, r.bolme_genislik_m AS "bolmeGenislikM", r.derinlik_m AS "derinlikM", r.kat_araligi_m AS "katAraligiM"
   FROM stok_konum k JOIN stok_raf r ON r.id = k.raf_id WHERE k.id = $1`, [konumId]);

// ---- Panel --------------------------------------------------------------------------------------------------------------
export const stokluMalzemeToplamlari = (db: Db): Promise<{ malzemeId: number; toplam: string }[]> =>
  db.sorgu('SELECT malzeme_id AS "malzemeId", sum(miktar)::text AS toplam FROM stok_bakiye GROUP BY malzeme_id ORDER BY malzeme_id');
// Değer grubu (228 a), sırayla: hurda ve fason konumu; yolda ya da sevkiyat konumu; karantina konumu ya da kalitesi kullanılamaz;
// raf, kabul, zemindeki statüsüz bakiye kullanılabilir; geri kalanı (istasyon, üretim çıkışı, ara alan, statülü yarı ürün) diğer.
// malzemeIdler verilirse yalnız o kartlar okunur (Malzeme 360 tek kart ister); verilmezse bütün kartlar.
export const degerGrubuMalzemeToplamlari = (db: Db, malzemeIdler: readonly number[] | null = null): Promise<{ malzemeId: number; grup: DegerGrubu; toplam: string }[]> =>
  db.sorgu(`SELECT b.malzeme_id AS "malzemeId",
              CASE WHEN k.tur IN ('hurda', 'fason') THEN k.tur WHEN k.tur IN ('yolda', 'sevkiyat') THEN 'yolda'
                   WHEN k.tur = 'karantina' OR NOT b.${KULLANILABILIR_SQL} THEN 'kalite'
                   WHEN k.tur = ANY($1::text[]) AND b.statu_id IS NULL THEN 'kullanilabilir' ELSE 'diger' END AS grup,
              sum(b.miktar)::text AS toplam
              FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE ($2::int[] IS NULL OR b.malzeme_id = ANY($2::int[]))
              GROUP BY 1, 2 ORDER BY 1, 2`, [KULLANILABILIR_KONUM_TURLERI, malzemeIdler === null ? null : [...malzemeIdler]]);
// Ay sonu (içinde bulunulan ay için bugün) malzeme toplamları, hurda konumu ayrı (1382 d: hurda talaş fiyatıyla): bugünkü bakiyeden
// ay sonundan sonraki hareketlerin net etkisi düşülür. Hareket hedef konumuna ekler, kaynak konumundan düşer; hurdaya ya da hurdadan
// taşıma iki ayrı satırı değiştirir. `son` ayın bittiği an (içinde bulunulan ayda null), `gun` ayın son günü (içinde bulunulan ayda
// bugün). Her ay en az bir satırla döner; toplamı sıfırın üstünde kart yoksa kart ve toplam null'dır.
// Hareketler önce ay kovasında toplanır (ay sonu ay başında olduğundan "son'dan sonra" ile "kovası son'dan sonra" aynıdır); yalnız
// istenen aylardaki hareket okunur, süre tarihçeyle büyümez.
export interface AySonuToplami { ay: string; son: string | null; gun: string; malzemeId: number | null; hurda: boolean | null; toplam: string | null }
export const aySonuMalzemeToplamlari = (db: Db, ay: number): Promise<AySonuToplami[]> => db.sorgu(
  `WITH aylar AS (
     SELECT a::date AS ay, CASE WHEN a < date_trunc('month', now()) THEN a + interval '1 month' END AS son
     FROM generate_series(date_trunc('month', now()) - make_interval(months => $1::int - 1), date_trunc('month', now()), interval '1 month') AS a),
   simdi AS (SELECT b.malzeme_id, k.tur = 'hurda' AS hurda, sum(b.miktar) AS m FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id GROUP BY 1, 2),
   etki AS (
     SELECT h.zaman, h.malzeme_id, k.tur = 'hurda' AS hurda, h.miktar AS d FROM stok_hareketi h JOIN stok_konum k ON k.id = h.hedef_konum_id
     UNION ALL
     SELECT h.zaman, h.malzeme_id, k.tur = 'hurda', -h.miktar FROM stok_hareketi h JOIN stok_konum k ON k.id = h.kaynak_konum_id),
   aylik AS (
     SELECT date_trunc('month', e.zaman) AS kova, e.malzeme_id, e.hurda, sum(e.d) AS n FROM etki e
     WHERE e.zaman >= (SELECT min(son) FROM aylar) GROUP BY 1, 2, 3),
   net AS (SELECT a.ay, m.malzeme_id, m.hurda, sum(m.n) AS n FROM aylar a JOIN aylik m ON m.kova >= a.son GROUP BY 1, 2, 3),
   kartlar AS (SELECT malzeme_id, hurda FROM simdi UNION SELECT malzeme_id, hurda FROM net)
   SELECT to_char(a.ay, 'YYYY-MM') AS ay, ${zamanMetni('a.son')} AS son,
     (CASE WHEN a.son IS NULL THEN current_date ELSE (a.ay + interval '1 month' - interval '1 day')::date END)::text AS gun,
     x."malzemeId", x.hurda, x.toplam
   FROM aylar a LEFT JOIN LATERAL (
     SELECT k.malzeme_id AS "malzemeId", k.hurda, (COALESCE(s.m, 0) - COALESCE(n.n, 0))::text AS toplam
     FROM kartlar k LEFT JOIN simdi s ON s.malzeme_id = k.malzeme_id AND s.hurda = k.hurda
       LEFT JOIN net n ON n.ay = a.ay AND n.malzeme_id = k.malzeme_id AND n.hurda = k.hurda
     WHERE COALESCE(s.m, 0) - COALESCE(n.n, 0) > 0) x ON true
   ORDER BY a.ay, x."malzemeId", x.hurda`, [ay]);
// Stok değerlemesi (1382 d): satın almadan gelen mal kabuller ve geri almaları, zaman sırasıyla; her biri için hareketten hemen önceki
// eldeki miktar (kartın bütün konumları; hareket geçmişinin toplamı). Hizmet ve fason dönüşü stok girişi olmadığından yoktur.
export interface DegerlemeAlisOlayiHam { malzemeId: number; zaman: string; miktar: string; once: string; malKabulSatirId: number; geri: boolean }
export const degerlemeAlisOlaylari = (db: Db, malzemeIdler: readonly number[]): Promise<DegerlemeAlisOlayiHam[]> => db.sorgu(
  `WITH h AS (
     SELECT h.id, h.malzeme_id, h.zaman, h.tur, h.giris_kaynagi, h.geri_alinan_id, h.miktar,
       COALESCE(sum(CASE WHEN h.hedef_konum_id IS NULL THEN 0 ELSE h.miktar END - CASE WHEN h.kaynak_konum_id IS NULL THEN 0 ELSE h.miktar END)
         OVER (PARTITION BY h.malzeme_id ORDER BY h.zaman, h.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS once
     FROM stok_hareketi h WHERE h.malzeme_id = ANY($1::int[]))
   SELECT h.malzeme_id AS "malzemeId", ${zamanMetni('h.zaman')} AS zaman, h.miktar::text AS miktar, h.once::text AS once,
     ks.id::int AS "malKabulSatirId", h.tur = 'geri_alma' AS geri
   FROM h JOIN stok_mal_kabul_satiri ks ON ks.hareket_id = CASE WHEN h.tur = 'geri_alma' THEN h.geri_alinan_id ELSE h.id END
   WHERE ((h.tur = 'giris' AND h.giris_kaynagi = 'mal_kabul') OR h.tur = 'geri_alma') AND ks.siparis_satir_id IS NOT NULL
     AND ks.fason_cikis_hareket_id IS NULL
   ORDER BY h.malzeme_id, h.zaman, h.id`, [malzemeIdler]);
export const panelSayilari = (db: Db): Promise<{ malzemeCesidi: number; gozDolu: number; gozToplam: number; kritik: number; eksi: number; kabulde: number } | null> => db.tek(
  `SELECT (SELECT count(DISTINCT malzeme_id)::int FROM stok_bakiye) AS "malzemeCesidi",
     (SELECT count(DISTINCT b.konum_id)::int FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE k.tur = 'raf_gozu' AND k.aktif) AS "gozDolu",
     (SELECT count(*)::int FROM stok_konum WHERE tur = 'raf_gozu' AND aktif) AS "gozToplam",
     (SELECT count(*)::int FROM stok_malzeme_ayari a WHERE a.kritik_seviye IS NOT NULL
        AND COALESCE((SELECT sum(miktar) FROM stok_bakiye b WHERE b.malzeme_id = a.malzeme_id AND b.statu_id IS NULL AND b.${KULLANILABILIR_SQL}), 0) <= a.kritik_seviye) AS kritik,
     (SELECT count(DISTINCT malzeme_id)::int FROM stok_bakiye WHERE miktar < 0) AS eksi,
     (SELECT count(DISTINCT b.malzeme_id)::int FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE k.tur = 'kabul' AND b.miktar > 0) AS kabulde`);
// Son yedi gün: giriş (giriş, sayım fazlası) ve çıkış (çıkış, sayım eksiği) hareket sayısı; gün sunucunun saat diliminde.
export const gunlukHareketler = (db: Db): Promise<{ gun: string; giris: number; cikis: number }[]> => db.sorgu(
  `SELECT to_char(g.gun, 'YYYY-MM-DD') AS gun,
     count(h.id) FILTER (WHERE h.tur IN ('giris', 'sayim_fazla'))::int AS giris,
     count(h.id) FILTER (WHERE h.tur IN ('cikis', 'sayim_eksik'))::int AS cikis
   FROM generate_series(current_date - 6, current_date, interval '1 day') AS g(gun)
   LEFT JOIN stok_hareketi h ON h.zaman >= g.gun AND h.zaman < g.gun + interval '1 day'
   GROUP BY g.gun ORDER BY g.gun`);
export const kritikMalzemeler = (db: Db): Promise<{ malzemeId: number; toplam: string; kritikSeviye: string }[]> => db.sorgu(
  `SELECT a.malzeme_id AS "malzemeId", COALESCE(t.toplam, 0)::text AS toplam, a.kritik_seviye AS "kritikSeviye"
   FROM stok_malzeme_ayari a LEFT JOIN LATERAL (SELECT sum(miktar) AS toplam FROM stok_bakiye b WHERE b.malzeme_id = a.malzeme_id AND b.statu_id IS NULL AND b.${KULLANILABILIR_SQL}) t ON true
   WHERE a.kritik_seviye IS NOT NULL AND COALESCE(t.toplam, 0) <= a.kritik_seviye
   ORDER BY COALESCE(t.toplam, 0) / NULLIF(a.kritik_seviye, 0) NULLS FIRST, a.malzeme_id LIMIT 8`);

// Arşivdeki silinmiş malzeme kartlarının bu modüldeki izi (2114c); malzemeler kablolamadan okur.
export async function malzemeKartiIzleri(db: Db, kartlar: readonly MalzemeKartiAnahtari[]): Promise<MalzemeKartiIzi[]> {
  if (kartlar.length === 0) return [];
  return db.sorgu<MalzemeKartiIzi>(
    `WITH k AS (SELECT * FROM unnest($1::int[], $2::text[], $3::text[]) AS k(no, kod, kimlik))
     SELECT k.no, 'Bakiye' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_bakiye t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Bakiye defteri bekleyeni' AS kayit, 'kesin' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN stok_bakiye_defter_bekleyen t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Defter farkı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_defter_farki t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Stok hareketi' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_hareketi t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Mal kabul satırı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_mal_kabul_satiri t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Ambalaj' AS kayit, 'kesin' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN stok_malzeme_ambalaji t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Malzeme ayarı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN stok_malzeme_ayari t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Malzeme isteği' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_malzeme_istegi t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Parti' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_parti t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Refakat partisi' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_refakat_partisi t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Rezerve' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_rezerve t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Rezerve kaydı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_rezerve_kaydi t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Sayım farkı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_sayim_farki t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Sepet satırı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_sepet_satiri t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Teslim' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_teslim t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Toplama adımı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN stok_toplama_adimi t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Toplama kalemi' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.toplama_id)::text AS ornek
       FROM k JOIN stok_toplama_kalemi t ON t.malzeme_id = k.no GROUP BY k.no`,
    [...malzemeKartiIzParametreleri(kartlar)],
  );
}

// 2151 (analiz): tüketim, kartın stoktan kullanıma çıkan net miktarıdır. Tedarikçiye iade tüketim değildir (alım geri döner); geri alma,
// geri aldığı çıkışın ayına ve nedenine düşülür. Ay tesis saatine göredir. Sıfır olan ay dönmez; çağıran ayları kendisi doldurur.
const TUKETIM_NEDENLERI = "('uretime_sarf', 'fire', 'sevk', 'numune', 'diger')";
const AY_SQL = `to_char(a.zaman AT TIME ZONE '${TESIS_SAAT_DILIMI}', 'YYYY-MM')`;
export const aylikTuketim = (db: Db, basAy: string, bitAy: string, malzemeIdler: readonly number[] | null): Promise<{ malzemeId: number; ay: string; miktar: string }[]> => db.sorgu(
  `SELECT h.malzeme_id AS "malzemeId", ${AY_SQL} AS ay, sum(CASE WHEN h.tur = 'cikis' THEN h.miktar ELSE -h.miktar END)::text AS miktar
   FROM stok_hareketi h JOIN stok_hareketi a ON a.id = COALESCE(h.geri_alinan_id, h.id)
   WHERE a.tur = 'cikis' AND a.cikis_nedeni IN ${TUKETIM_NEDENLERI}
     AND ${AY_SQL} BETWEEN $1 AND $2 AND ($3::int[] IS NULL OR h.malzeme_id = ANY($3::int[]))
   GROUP BY 1, 2 HAVING sum(CASE WHEN h.tur = 'cikis' THEN h.miktar ELSE -h.miktar END) <> 0 ORDER BY 1, 2`,
  [basAy, bitAy, malzemeIdler === null ? null : [...malzemeIdler]]);
// 2623 a, 2709 c: ayın (tesis saat dilimi) geri alınmamış emirsiz genel kullanım çıkışları ve sayım eksikleri. Geri alma aylikTuketim'deki gibi çıkışın kendi
// ayından düşer; geri alma bütün miktarı çevirdiğinden geri alınan çıkış hiç sayılmaz.
export const emirsizCikislar = (db: Db, ay: string): Promise<{ malzemeId: number; zaman: string; miktar: string }[]> => db.sorgu(
  `SELECT a.malzeme_id AS "malzemeId", ${zamanMetni('a.zaman')} AS zaman, a.miktar::text AS miktar
   FROM stok_hareketi a
   WHERE ((a.tur = 'cikis' AND a.cikis_nedeni = ANY($2::text[])) OR a.tur = 'sayim_eksik') AND a.uretim_emri_id IS NULL
     AND a.zaman >= ($1 || '-01')::timestamp AT TIME ZONE '${TESIS_SAAT_DILIMI}'
     AND a.zaman < (($1 || '-01')::timestamp + interval '1 month') AT TIME ZONE '${TESIS_SAAT_DILIMI}'
     AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = a.id)
   ORDER BY a.zaman, a.id`, [ay, [...EMIRSIZ_CIKIS_NEDENLERI]]);
// Kartın ilk hareketi (geçmişin ne kadar geriye gittiği) ve geri alınmamış son tüketim çıkışı; hareketi olmayan kart dönmez.
export const tuketimTarihleri = (db: Db, malzemeIdler: readonly number[] | null): Promise<{ malzemeId: number; ilkHareket: string; sonTuketim: string | null }[]> => db.sorgu(
  `SELECT h.malzeme_id AS "malzemeId", ${zamanMetni('min(h.zaman)')} AS "ilkHareket",
     ${zamanMetni(`max(h.zaman) FILTER (WHERE h.tur = 'cikis' AND h.cikis_nedeni IN ${TUKETIM_NEDENLERI}
       AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id))`)} AS "sonTuketim"
   FROM stok_hareketi h WHERE ($1::int[] IS NULL OR h.malzeme_id = ANY($1::int[])) GROUP BY 1 ORDER BY 1`,
  [malzemeIdler === null ? null : [...malzemeIdler]]);
