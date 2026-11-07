import type { Db } from '#cekirdek/db.ts';
import type { Dilim, SiralamaIstegi } from '#cekirdek/liste.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { KaliteDurumu, MalzemeFisiTuru } from '#paylasilan/sozlesme/stok.ts';
import { FIS_DEGISTI, HAREKET_BAGLARI, HAREKET_SECIMI, MAL_KABUL_SECIMI } from '../ortak/sorgular.ts';
import type { HareketHam, MalKabulHam } from '../depo/sorgular.ts';

// Emir açılınca üç fiş boş açılır (294 c); varsa dokunulmaz.
export const emirFisleriniAc = (db: Db, emirId: number): Promise<unknown[]> => db.sorgu(
  `INSERT INTO stok_malzeme_fisi (tur, uretim_emri_id) VALUES ('sarf', $1), ('uretim_girisi', $1), ('fire', $1)
   ON CONFLICT (uretim_emri_id, tur) WHERE uretim_emri_id IS NOT NULL DO NOTHING RETURNING id`, [emirId]);
// Hareketsiz değişiklik (mamul hurda sayımı üretimden girişin "Hurda" satırını değiştirir): fiş yoksa açılır.
export const emirFisiDegisti = (db: Db, emirId: number, tur: 'sarf' | 'uretim_girisi' | 'fire'): Promise<unknown[]> => db.sorgu(
  `INSERT INTO stok_malzeme_fisi AS f (tur, uretim_emri_id, degisiklik) VALUES ($1, $2, 1)
   ON CONFLICT (uretim_emri_id, tur) WHERE uretim_emri_id IS NOT NULL DO UPDATE SET ${FIS_DEGISTI} RETURNING f.id`, [tur, emirId]);

export interface MalzemeFisiHam {
  id: number; tur: MalzemeFisiTuru; uretimEmriId: number | null; acilis: string; degisiklik: number; degisiklikZamani: string;
  gonderimIstegi: string | null; surum: number;
}
const MALZEME_FISI_SECIMI = `SELECT f.id, f.tur, f.uretim_emri_id AS "uretimEmriId", ${zamanMetni('f.acilis')} AS acilis, f.degisiklik,
  ${zamanMetni('f.degisiklik_zamani')} AS "degisiklikZamani", ${zamanMetni('f.gonderim_istegi')} AS "gonderimIstegi", f.surum FROM stok_malzeme_fisi f`;
export const MALZEME_FISI_SIRALAMASI: SiralamaTanimi<'acilis'> = { sutunlar: { acilis: 'f.acilis' }, ikincil: 'f.id', varsayilan: { sutun: 'f.acilis', yon: 'azalan' } };
export interface MalzemeFisiSuzgeci { tur?: MalzemeFisiTuru | undefined; uretimEmriId?: number | undefined; idler?: readonly number[] | undefined }
function malzemeFisiKosulu(s: MalzemeFisiSuzgeci, ilk: number): { sql: string; degerler: unknown[] } {
  const kosullar: string[] = [];
  const degerler: unknown[] = [];
  const ekle = (sql: (n: number) => string, deger: unknown) => { degerler.push(deger); kosullar.push(sql(ilk + degerler.length - 1)); };
  if (s.tur !== undefined) ekle((n) => `f.tur = $${n}`, s.tur);
  if (s.uretimEmriId !== undefined) ekle((n) => `f.uretim_emri_id = $${n}`, s.uretimEmriId);
  if (s.idler !== undefined) ekle((n) => `f.id = ANY($${n}::int[])`, [...s.idler]);
  return { sql: kosullar.length ? `WHERE ${kosullar.join(' AND ')}` : '', degerler };
}
export const malzemeFisiSay = async (db: Db, s: MalzemeFisiSuzgeci): Promise<number> => {
  const k = malzemeFisiKosulu(s, 1);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM stok_malzeme_fisi f ${k.sql}`, k.degerler))?.toplam ?? 0;
};
export const malzemeFisleri = (db: Db, s: MalzemeFisiSuzgeci, sira: SiralamaIstegi<'acilis'>, d: Dilim): Promise<MalzemeFisiHam[]> => {
  const k = malzemeFisiKosulu(s, 3);
  return db.sorgu(`${MALZEME_FISI_SECIMI} ${k.sql} ORDER BY ${siralamaSql(MALZEME_FISI_SIRALAMASI, sira)} LIMIT $1 OFFSET $2`, [d.sinir, d.atla, ...k.degerler]);
};
// Logo durumuyla süzmede aday kimlikler: süzgece uyan en yeni fişler (sınırlı).
export const malzemeFisiKimlikleri = (db: Db, s: MalzemeFisiSuzgeci, sinir: number): Promise<MalzemeFisiHam[]> => {
  const k = malzemeFisiKosulu(s, 2);
  return db.sorgu(`${MALZEME_FISI_SECIMI} ${k.sql} ORDER BY f.acilis DESC, f.id DESC LIMIT $1`, [sinir, ...k.degerler]);
};
export const malzemeFisleriBul = (db: Db, idler: readonly number[]): Promise<MalzemeFisiHam[]> =>
  db.sorgu(`${MALZEME_FISI_SECIMI} WHERE f.id = ANY($1::int[]) ORDER BY f.id`, [[...idler]]);
// Malzeme fişleri listesi (515 a): fiş ve mal kabul belgesi açılış zamanıyla tek sırada sayfalanır; ayrıntı kimlikle ayrıca okunur.
// 2023 b: teslim fişi, toplama listesi ve hareket fişi de aynı sırada. Hareket fişi "Tümü"de yoktur: her mal kabul ve teslim aynı
// komutta bir hareket fişi de açar, Tümü'de aynı iş iki kez görünürdü; hareket fişi yalnız kendi türüyle süzülünce listelenir.
export type BelgeKaynagi = 'fis' | 'mal_kabul' | 'teslim_fisi' | 'toplama' | 'hareket_fisi';
export interface ListeFisiAnahtari { kaynak: BelgeKaynagi; id: number }
const LISTE_FISI_BIRLESIMI = `(SELECT 'fis'::text AS kaynak, f.id, f.acilis FROM stok_malzeme_fisi f
  UNION ALL SELECT 'mal_kabul'::text, m.id, m.zaman FROM stok_mal_kabul m
  UNION ALL SELECT 'teslim_fisi'::text, t.id, t.zaman FROM stok_fis t
  UNION ALL SELECT 'toplama'::text, l.id, l.acilis FROM stok_toplama l
  UNION ALL SELECT 'hareket_fisi'::text, h.id, h.zaman FROM stok_hareket_fisi h) b
  WHERE ($1::text IS NULL AND b.kaynak <> 'hareket_fisi') OR b.kaynak = $1`;
export const LISTE_FISI_SIRALAMASI: SiralamaTanimi<'acilis'> = { sutunlar: { acilis: 'b.acilis' }, ikincil: 'b.id', varsayilan: { sutun: 'b.acilis', yon: 'azalan' } };
export const listeFisiSay = async (db: Db, kaynak: ListeFisiAnahtari['kaynak'] | null): Promise<number> =>
  (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM ${LISTE_FISI_BIRLESIMI}`, [kaynak]))?.toplam ?? 0;
export const listeFisleri = (db: Db, kaynak: ListeFisiAnahtari['kaynak'] | null, sira: SiralamaIstegi<'acilis'>, d: Dilim): Promise<ListeFisiAnahtari[]> =>
  db.sorgu(`SELECT b.kaynak, b.id FROM ${LISTE_FISI_BIRLESIMI} ORDER BY ${siralamaSql(LISTE_FISI_SIRALAMASI, sira)}, b.kaynak LIMIT $2 OFFSET $3`, [kaynak, d.sinir, d.atla]);
// Belgeler listesinde mal kabul ve malzeme fişi dışındaki belgeler: no, zaman, satır sayısı, varsa emir.
export interface BelgeHam { id: number; no: string; zaman: string; satirSayisi: number; uretimEmriId: number | null; altTur: string | null }
export const teslimFisleriBul = (db: Db, idler: readonly number[]): Promise<BelgeHam[]> =>
  db.sorgu(`SELECT f.id, f.no, ${zamanMetni('f.zaman')} AS zaman, (SELECT count(*)::int FROM stok_fis_satiri s WHERE s.fis_id = f.id) AS "satirSayisi",
    f.uretim_emri_id AS "uretimEmriId", f.cikis_nedeni AS "altTur" FROM stok_fis f WHERE f.id = ANY($1::int[]) ORDER BY f.id`, [[...idler]]);
export const toplamalarBul = (db: Db, idler: readonly number[]): Promise<BelgeHam[]> =>
  db.sorgu(`SELECT l.id, l.no, ${zamanMetni('l.acilis')} AS zaman, (SELECT count(*)::int FROM stok_toplama_kalemi k WHERE k.toplama_id = l.id) AS "satirSayisi",
    NULL::int AS "uretimEmriId", l.ad AS "altTur" FROM stok_toplama l WHERE l.id = ANY($1::int[]) ORDER BY l.id`, [[...idler]]);
export const hareketFisleriBul = (db: Db, idler: readonly number[]): Promise<BelgeHam[]> =>
  db.sorgu(`SELECT h.id, h.no, ${zamanMetni('h.zaman')} AS zaman, (SELECT count(*)::int FROM stok_hareket_fisi_satiri s WHERE s.fis_id = h.id) AS "satirSayisi",
    NULL::int AS "uretimEmriId", h.tur AS "altTur" FROM stok_hareket_fisi h WHERE h.id = ANY($1::int[]) ORDER BY h.id`, [[...idler]]);
// Numarası ayar kalıbından gelen belgeler önekten çözülmez; numarayla tam eşleşme aranır (büyük küçük harf ayrılmaz).
export const belgeNoBul = (db: Db, no: string): Promise<ListeFisiAnahtari[]> =>
  db.sorgu(`SELECT 'teslim_fisi'::text AS kaynak, id FROM stok_fis WHERE upper(no) = upper($1)
    UNION ALL SELECT 'toplama'::text, id FROM stok_toplama WHERE upper(no) = upper($1)
    UNION ALL SELECT 'hareket_fisi'::text, id FROM stok_hareket_fisi WHERE upper(no) = upper($1)`, [no.trim()]);
export const malKabullerBul = (db: Db, idler: readonly number[]): Promise<MalKabulHam[]> =>
  db.sorgu(`${MAL_KABUL_SECIMI} FROM stok_mal_kabul m WHERE m.id = ANY($1::int[]) ORDER BY m.id`, [[...idler]]);
export const emirlerinMalzemeFisleri = (db: Db, emirIdler: readonly number[]): Promise<MalzemeFisiHam[]> =>
  db.sorgu(`${MALZEME_FISI_SECIMI} WHERE f.uretim_emri_id = ANY($1::int[]) ORDER BY f.id`, [[...emirIdler]]);
// Değişiklik akışı: (zaman, kimlik) sırasıyla verilen noktadan sonra değişen fişler.
export const degisenMalzemeFisleri = (db: Db, a: { zaman: string | null; id: number; sinir: number }): Promise<MalzemeFisiHam[]> =>
  db.sorgu(`${MALZEME_FISI_SECIMI} WHERE $1::timestamptz IS NULL OR (f.degisiklik_zamani, f.id) > ($1::timestamptz, $2::int)
    ORDER BY f.degisiklik_zamani, f.id LIMIT $3`, [a.zaman, a.id, a.sinir]);

// Fişin net satırları: hareketler geri almalarıyla birlikte toplanır, sıfır satır düşer. Ambar fişinde satır depo çiftine göre ayrılır
// (ambar numarası bugünkü depo tanımından okunur).
export interface MalzemeFisiSatirHam { fisId: number; malzemeId: number; kaynakAmbarNo: number | null; hedefAmbarNo: number | null; miktar: string }
export const malzemeFisiSatirlari = (db: Db, fisIdler: readonly number[]): Promise<MalzemeFisiSatirHam[]> => db.sorgu(
  `SELECT l.fis_id AS "fisId", a.malzeme_id AS "malzemeId",
     CASE WHEN f.tur = 'ambar' THEN kd.logo_ambar_no END AS "kaynakAmbarNo", CASE WHEN f.tur = 'ambar' THEN hd.logo_ambar_no END AS "hedefAmbarNo",
     sum(CASE WHEN h.tur = 'geri_alma' THEN -h.miktar ELSE h.miktar END)::text AS miktar
   FROM stok_malzeme_fisi_hareketi l
   JOIN stok_malzeme_fisi f ON f.id = l.fis_id
   JOIN stok_hareketi h ON h.id = l.hareket_id
   JOIN stok_hareketi a ON a.id = COALESCE(h.geri_alinan_id, h.id)
   LEFT JOIN stok_konum kk ON kk.id = a.kaynak_konum_id LEFT JOIN stok_depo kd ON kd.id = kk.depo_id
   LEFT JOIN stok_konum hk ON hk.id = a.hedef_konum_id LEFT JOIN stok_depo hd ON hd.id = hk.depo_id
   WHERE l.fis_id = ANY($1::int[])
   GROUP BY 1, 2, 3, 4
   HAVING sum(CASE WHEN h.tur = 'geri_alma' THEN -h.miktar ELSE h.miktar END) <> 0
   ORDER BY 1, 2, 3, 4`, [[...fisIdler]]);
export const malzemeFisininHareketleri = (db: Db, fisId: number): Promise<HareketHam[]> =>
  db.sorgu(`${HAREKET_SECIMI} ${HAREKET_BAGLARI} WHERE h.id IN (SELECT hareket_id FROM stok_malzeme_fisi_hareketi WHERE fis_id = $1) ORDER BY h.id`, [fisId]);
// Elle gönderim ve yeniden gönderim isteği: zaman ve kişi sunucudan; değişiklik sayılır ki Logo giden kutusu fişi yeniden görsün.
export const gonderimIstegiYaz = (db: Db, id: number, surum: number, kisiId: number): Promise<{ id: number } | null> => db.tek(
  `UPDATE stok_malzeme_fisi f SET gonderim_istegi = now(), gonderim_isteyen_kisi_id = $3, ${FIS_DEGISTI}, surum = f.surum + 1
   WHERE f.id = $1 AND f.surum = $2 RETURNING f.id`, [id, surum, kisiId]);
export const malzemeFisiVarMi = async (db: Db, id: number): Promise<boolean> =>
  (await db.tek('SELECT 1 AS var FROM stok_malzeme_fisi WHERE id = $1', [id])) !== null;

// Kalite durum etiketi (kart 1525, 1286 a): kalite durumu bakiye satırındadır (lotun değil); etiket o satırın lotunu, miktarını ve
// durumunu basar. Lotsuz ve boş satır etiket vermez.
export interface KaliteEtiketiHam { bakiyeId: number; lotNo: string; malzemeId: number; konumKod: string; miktar: string; kaliteDurumu: KaliteDurumu }
export const kaliteEtiketleri = (db: Db, bakiyeIdler: readonly number[]): Promise<KaliteEtiketiHam[]> => db.sorgu(
  `SELECT b.id AS "bakiyeId", p.lot_no AS "lotNo", b.malzeme_id AS "malzemeId", k.kod AS "konumKod", b.miktar::text AS miktar, b.kalite_durumu AS "kaliteDurumu"
     FROM stok_bakiye b JOIN stok_parti p ON p.id = b.parti_id JOIN stok_konum k ON k.id = b.konum_id
    WHERE b.id = ANY($1::int[]) AND b.miktar > 0`, [bakiyeIdler]);
