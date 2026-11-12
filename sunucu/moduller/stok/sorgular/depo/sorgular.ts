import type { Db } from '#cekirdek/db.ts';
import type { Dilim, SiralamaIstegi } from '#cekirdek/liste.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { basDeseni } from '#paylasilan/kayit-aramasi.ts';
import type { KaliteDurumu, KonumTuru } from '#paylasilan/sozlesme/stok.ts';
import { S, icinde } from '../ortak/sorgular.ts';

// ---- Satır tipleri ----------------------------------------------------------------------------------------------
export interface DepoSatiri { id: number; kod: string; ad: string; logoAmbarNo: number | null }
export interface KonumSatiri {
  id: number; kod: string; tur: KonumTuru; ad: string | null; depoId: number; depoKod: string;
  rafId: number | null; bolmeNo: number | null; katNo: number | null; sonSayim: string | null; aktif: boolean; satirSayisi: number;
  haritaGozId: number | null; haritaAlanId: number | null; surum: number;
}
export interface RafSatiri {
  id: number; depoId: number; kod: string; tur: 'palet' | 'celik' | 'konsol' | 'zemin'; numaralama: 'sirali' | 'tek' | 'cift'; ilkBolme: number;
  bolmeSayisi: number; katSayisi: number; bolmeGenislikM: string; derinlikM: string; katAraligiM: string; aktif: boolean; doluGoz: number; toplamGoz: number; surum: number;
}
export interface BakiyeHam {
  id: number; malzemeId: number; konumId: number; konumKod: string; konumTur: string; partiId: number | null;
  lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; uretimEmriId: number | null; miktar: string; ilkGiris: string;
  ambalajTur: 'kasa' | 'koli' | 'palet' | 'bidon' | 'makara' | null; ambalajOlcu: string | null; ambalajAdet: number | null;
  statuId: number | null; kaliteDurumu: KaliteDurumu;
  // 2099-2 c: lotun son kullanma tarihi (YYYY-AA-GG); tarihi olmayan lotta ve partisiz satırda null.
  sonKullanma: string | null;
  // 2224-2 b: bu konuma geliş (stok_bakiye.konuma_gelis); giriş hareketi bulunmayan eski satırda null.
  konumaGelis: string | null;
}
export interface HareketHam {
  id: number; zaman: string; tur: 'giris' | 'cikis' | 'transfer' | 'sayim_fazla' | 'sayim_eksik' | 'geri_alma'; malzemeId: number; partiId: number | null;
  lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; partiEmirId: number | null; kaynakKonumId: number | null; hedefKonumId: number | null;
  kaynakKonumKod: string | null; hedefKonumKod: string | null; miktar: string; onayliEksi: boolean; girisKaynagi: 'mal_kabul' | 'uretim' | null;
  cikisNedeni: 'uretime_sarf' | 'sevk' | 'fire' | 'numune' | 'diger' | null; uretimEmriId: number | null; geriAlinanId: number | null;
  geriAlindi: boolean; malKabulSatiriMi: boolean; fisId: number | null; fisNo: string | null; hareketFisiId: number | null; hareketFisiNo: string | null; akis: string | null; kisiId: number; aciklama: string | null;
  kaynakStatuId: number | null; hedefStatuId: number | null; kaynakKaliteDurumu: KaliteDurumu | null; hedefKaliteDurumu: KaliteDurumu | null;
}
export interface PartiHam {
  id: number; malzemeId: number; lotNo: string; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null;
  uretimEmriId: number | null; kayitZamani: string; eldeki: string;
}
export interface MalKabulHam {
  id: number; no: string; tur: 'satin_alma' | 'iade' | 'diger'; irsaliyeNo: string | null; zaman: string; kisiId: number;
  satirSayisi: number; farkSayisi: number; duzeltilenId: number | null; duzeltenId: number | null;
}

// ---- Depo ve konum ------------------------------------------------------------------------------------------------
export const depolar = (db: Db): Promise<DepoSatiri[]> =>
  db.sorgu('SELECT id, kod, ad, logo_ambar_no AS "logoAmbarNo" FROM stok_depo WHERE aktif ORDER BY kod, id');
export const depoKimligi = async (db: Db, kod: string): Promise<number | null> =>
  (await db.tek<{ id: number }>('SELECT id FROM stok_depo WHERE kod = $1', [kod]))?.id ?? null;
export const depoVarMi = async (db: Db, id: number): Promise<boolean> =>
  (await db.tek<{ v: number }>('SELECT 1 AS v FROM stok_depo WHERE id = $1 AND aktif', [id])) !== null;

const KONUM_SECIMI = `SELECT k.id, k.kod, k.tur, k.ad, k.depo_id AS "depoId", d.kod AS "depoKod", k.raf_id AS "rafId", k.bolme_no AS "bolmeNo",
  k.kat_no AS "katNo", ${zamanMetni('k.son_sayim')} AS "sonSayim", k.aktif, k.surum, k.atolye_goz_id AS "haritaGozId", k.atolye_alan_id AS "haritaAlanId",
  (SELECT count(*)::int FROM stok_bakiye b WHERE b.konum_id = k.id) AS "satirSayisi"`;
const KONUM_KAYNAGI = 'FROM stok_konum k JOIN stok_depo d ON d.id = k.depo_id';

export const konumBul = (db: Db, id: number, kilit = false): Promise<KonumSatiri | null> =>
  db.tek(`${KONUM_SECIMI} ${KONUM_KAYNAGI} WHERE k.id = $1${kilit ? ' FOR UPDATE OF k' : ''}`, [id]);
export const konumKoduyla = (db: Db, kod: string): Promise<KonumSatiri | null> => db.tek(`${KONUM_SECIMI} ${KONUM_KAYNAGI} WHERE k.kod = $1`, [kod]);
export interface KonumSuzgeci { tur?: string | undefined; rafId?: number | undefined; metin?: string | undefined }
const konumSuzgeci = (s: KonumSuzgeci): { sql: string; p: unknown[] } => ({
  sql: `${KONUM_KAYNAGI} WHERE k.aktif AND ($1::text IS NULL OR k.tur = $1) AND ($2::int IS NULL OR k.raf_id = $2)
        AND ($3::text IS NULL OR ${S('k.kod')} LIKE $3 OR ${S('k.ad')} LIKE $3)`,
  p: [s.tur ?? null, s.rafId ?? null, icinde(s.metin)],
});
export const KONUM_SIRALAMASI: SiralamaTanimi<'kod' | 'tur'> = { sutunlar: { kod: 'k.kod', tur: 'k.tur' }, ikincil: 'k.id', varsayilan: { sutun: 'k.kod', yon: 'artan' } };
export async function konumSay(db: Db, s: KonumSuzgeci): Promise<number> {
  const f = konumSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${f.sql}`, f.p))?.toplam ?? 0;
}
export function konumlar(db: Db, s: KonumSuzgeci, sira: SiralamaIstegi<'kod' | 'tur'>, d: Dilim): Promise<KonumSatiri[]> {
  const f = konumSuzgeci(s);
  return db.sorgu(`${KONUM_SECIMI} ${f.sql} ORDER BY ${siralamaSql(KONUM_SIRALAMASI, sira)} LIMIT $4 OFFSET $5`, [...f.p, d.sinir, d.atla]);
}
export const konumAc = async (db: Db, k: { depoId: number; kod: string; tur: string; ad: string | null }): Promise<number> =>
  (await db.tek<{ id: number }>('INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, $2, $3, $4) RETURNING id', [k.depoId, k.kod, k.tur, k.ad]))!.id;
export const konumGuncelle = (db: Db, id: number, surum: number, k: { kod: string; ad: string | null; tur: string | null }): Promise<{ id: number } | null> =>
  db.tek('UPDATE stok_konum SET kod = $3, ad = $4, tur = COALESCE($5, tur), surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum, k.kod, k.ad, k.tur]);
export const konumPasifYap = (db: Db, id: number, surum: number): Promise<{ id: number } | null> =>
  db.tek('UPDATE stok_konum SET aktif = false, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum]);
export const konumSayildi = (db: Db, id: number): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_konum SET son_sayim = now(), surum = surum + 1 WHERE id = $1 RETURNING id', [id]);
// ---- Fabrika Haritası eşlemesi (#686) ---------------------------------------------------------------------------------------------
export const haritaDepolari = (db: Db): Promise<{ id: number; kod: string; salonId: number | null; aktif: boolean }[]> =>
  db.sorgu('SELECT id, kod, atolye_salon_id AS "salonId", aktif FROM stok_depo ORDER BY id');
export const depoAktifligi = (db: Db, id: number, aktif: boolean): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_depo SET aktif = $2, surum = surum + 1 WHERE id = $1 AND aktif <> $2 RETURNING id', [id, aktif]);
// Depodan çıkarma engeli: bakiyesi olan ya da sabit (KABUL, URETIM) konum.
export const depoDoluMu = async (db: Db, depoId: number): Promise<{ bakiye: number; sabit: number }> =>
  (await db.tek<{ bakiye: number; sabit: number }>(`SELECT (SELECT count(*)::int FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE k.depo_id = $1) AS bakiye,
     (SELECT count(*)::int FROM stok_konum WHERE depo_id = $1 AND kod IN ('KABUL', 'URETIM')) AS sabit`, [depoId]))!;
export const depoKonumlariniKapat = (db: Db, depoId: number): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_konum SET aktif = false, surum = surum + 1 WHERE depo_id = $1 AND aktif RETURNING id', [depoId]);
export const haritaDeposuAc = async (db: Db, d: { salonId: number; kod: string; ad: string }): Promise<number> =>
  (await db.tek<{ id: number }>('INSERT INTO stok_depo (kod, ad, atolye_salon_id) VALUES ($1, $2, $3) RETURNING id', [d.kod, d.ad, d.salonId]))!.id;
// Haritaya bağlı ya da haritadan açılıp bağı boşalmış (raf gözü, stok rafı yok) konumlar.
export const haritaKonumlari = (db: Db): Promise<{ id: number; kod: string; tur: string; depoId: number; aktif: boolean; rafId: number | null; gozId: number | null; alanId: number | null; satirSayisi: number }[]> =>
  db.sorgu(`SELECT k.id, k.kod, k.tur, k.depo_id AS "depoId", k.aktif, k.raf_id AS "rafId", k.atolye_goz_id AS "gozId", k.atolye_alan_id AS "alanId",
                   (SELECT count(*)::int FROM stok_bakiye b WHERE b.konum_id = k.id) AS "satirSayisi"
              FROM stok_konum k
             WHERE k.atolye_goz_id IS NOT NULL OR k.atolye_alan_id IS NOT NULL OR (k.tur = 'raf_gozu' AND k.raf_id IS NULL)`);
// Haritadaki öğeye (göz, alan, istasyon) bağlı aktif konumlar; yerdeki kare öğeden bulunur (kart #1304).
export const zeminKonumlari = (db: Db): Promise<{ id: number; kod: string; tur: KonumTuru; gozId: number | null; alanId: number | null; istasyonId: number | null; satirSayisi: number }[]> =>
  db.sorgu(`SELECT k.id, k.kod, k.tur, k.atolye_goz_id AS "gozId", k.atolye_alan_id AS "alanId", k.istasyon_id AS "istasyonId",
                   (SELECT count(*)::int FROM stok_bakiye b WHERE b.konum_id = k.id) AS "satirSayisi"
              FROM stok_konum k
             WHERE k.aktif AND (k.atolye_goz_id IS NOT NULL OR k.atolye_alan_id IS NOT NULL OR k.istasyon_id IS NOT NULL)
             ORDER BY k.kod`);
export const haritaBagSayilari = async (db: Db): Promise<{ bolum: number; goz: number; alan: number }> =>
  (await db.tek<{ bolum: number; goz: number; alan: number }>(`SELECT (SELECT count(*)::int FROM stok_depo WHERE aktif AND atolye_salon_id IS NOT NULL) AS bolum,
     (SELECT count(*)::int FROM stok_konum WHERE aktif AND atolye_goz_id IS NOT NULL) AS goz,
     (SELECT count(*)::int FROM stok_konum WHERE aktif AND atolye_alan_id IS NOT NULL) AS alan`))!;
export const haritasizKonumlar = (db: Db): Promise<{ id: number; kod: string; tur: KonumSatiri['tur']; satirSayisi: number }[]> =>
  db.sorgu(`SELECT k.id, k.kod, k.tur, (SELECT count(*)::int FROM stok_bakiye b WHERE b.konum_id = k.id) AS "satirSayisi"
              FROM stok_konum k WHERE k.aktif AND k.atolye_goz_id IS NULL AND k.atolye_alan_id IS NULL ORDER BY k.tur, k.kod`);
// Göz başına stok: kalem (bakiye satırı) sayısı ve en eski girişli malzeme.
export const gozStoklari = (db: Db, gozIdler: number[]): Promise<{ gozId: number; konumId: number; kalemSayisi: number; ilkMalzemeId: number | null }[]> =>
  db.sorgu(`SELECT k.atolye_goz_id AS "gozId", k.id AS "konumId", count(b.id)::int AS "kalemSayisi",
                   (array_agg(b.malzeme_id ORDER BY b.ilk_giris, b.id) FILTER (WHERE b.id IS NOT NULL))[1] AS "ilkMalzemeId"
              FROM stok_konum k JOIN stok_bakiye b ON b.konum_id = k.id
             WHERE k.atolye_goz_id = ANY($1::int[]) GROUP BY k.atolye_goz_id, k.id`, [gozIdler]);
export const tumKonumKodlari = async (db: Db): Promise<string[]> => (await db.sorgu<{ kod: string }>('SELECT kod FROM stok_konum')).map((r) => r.kod);
export const haritaKonumuAc = (db: Db, k: { depoId: number; kod: string; tur: string; bolme: number | null; kat: number | null; ad: string | null; gozId: number | null; alanId: number | null; aktif: boolean }): Promise<unknown[]> =>
  db.sorgu(`INSERT INTO stok_konum (depo_id, kod, tur, bolme_no, kat_no, ad, atolye_goz_id, atolye_alan_id, aktif)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, [k.depoId, k.kod, k.tur, k.bolme, k.kat, k.ad, k.gozId, k.alanId, k.aktif]);
export const haritaKonumuGuncelle = (db: Db, k: { id: number; kod: string; aktif: boolean }): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_konum SET kod = $2, aktif = $3, surum = surum + 1 WHERE id = $1 RETURNING id', [k.id, k.kod, k.aktif]);
// Stoklu konumun türü değişmez: kullanılabilir stok yalnız taşımayla değişir.
export const haritaKonumuTuru = (db: Db, k: { id: number; tur: string; depoId: number }): Promise<unknown[]> =>
  db.sorgu(`UPDATE stok_konum k SET tur = $2, depo_id = $3, surum = surum + 1 WHERE k.id = $1
              AND NOT EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.konum_id = k.id) RETURNING k.id`, [k.id, k.tur, k.depoId]);
export const haritaKonumlariniKapat = (db: Db, idler: number[]): Promise<unknown[]> =>
  db.sorgu(`UPDATE stok_konum k SET aktif = false, surum = surum + 1 WHERE k.id = ANY($1::int[]) AND k.aktif
              AND NOT EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.konum_id = k.id) RETURNING k.id`, [idler]);
export interface KonumKodu { id: number; kod: string; tur: KonumTuru; ad: string | null; bolmeNo: number | null; katNo: number | null; aktif: boolean; satirSayisi: number }
export const kodDurumlari = (db: Db, s: { idler?: number[]; rafId?: number }): Promise<KonumKodu[]> =>
  db.sorgu(`SELECT k.id, k.kod, k.tur, k.ad, k.bolme_no AS "bolmeNo", k.kat_no AS "katNo", k.aktif,
              (SELECT count(*)::int FROM stok_bakiye b WHERE b.konum_id = k.id) AS "satirSayisi"
            FROM stok_konum k WHERE k.id = ANY($1::int[]) OR k.raf_id = $2`,
    [s.idler ?? [], s.rafId ?? null]);
export const konumVarMi = async (db: Db, id: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_konum WHERE id = $1', [id])) !== null;

// ---- Raf -----------------------------------------------------------------------------------------------------------
const RAF_SECIMI = `SELECT r.id, r.depo_id AS "depoId", r.kod, r.tur, r.numaralama, r.ilk_bolme AS "ilkBolme", r.bolme_sayisi AS "bolmeSayisi",
  r.kat_sayisi AS "katSayisi", r.bolme_genislik_m AS "bolmeGenislikM", r.derinlik_m AS "derinlikM", r.kat_araligi_m AS "katAraligiM", r.aktif, r.surum,
  (SELECT count(*)::int FROM stok_konum k WHERE k.raf_id = r.id AND k.aktif) AS "toplamGoz",
  (SELECT count(DISTINCT b.konum_id)::int FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE k.raf_id = r.id) AS "doluGoz"`;
export const rafBul = (db: Db, id: number, kilit = false): Promise<RafSatiri | null> =>
  db.tek(`${RAF_SECIMI} FROM stok_raf r WHERE r.id = $1${kilit ? ' FOR UPDATE OF r' : ''}`, [id]);
export interface RafSuzgeci { tur?: string | undefined; metin?: string | undefined }
const rafSuzgeci = (s: RafSuzgeci) => ({ sql: `FROM stok_raf r WHERE r.aktif AND ($1::text IS NULL OR r.tur = $1) AND ($2::text IS NULL OR ${S('r.kod')} LIKE $2)`, p: [s.tur ?? null, s.metin == null ? null : basDeseni(s.metin)] });
export const RAF_SIRALAMASI: SiralamaTanimi<'kod'> = { sutunlar: { kod: 'r.kod' }, ikincil: 'r.id', varsayilan: { sutun: 'r.kod', yon: 'artan' } };
export async function rafSay(db: Db, s: RafSuzgeci): Promise<number> {
  const f = rafSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${f.sql}`, f.p))?.toplam ?? 0;
}
export function raflar(db: Db, s: RafSuzgeci, sira: SiralamaIstegi<'kod'>, d: Dilim): Promise<RafSatiri[]> {
  const f = rafSuzgeci(s);
  return db.sorgu(`${RAF_SECIMI} ${f.sql} ORDER BY ${siralamaSql(RAF_SIRALAMASI, sira)} LIMIT $3 OFFSET $4`, [...f.p, d.sinir, d.atla]);
}
export interface RafAlanlari { depoId: number; kod: string; tur: string; numaralama: string; ilkBolme: number; bolmeSayisi: number; katSayisi: number; bolmeGenislikM: string; derinlikM: string; katAraligiM: string }
export const rafAc = async (db: Db, r: RafAlanlari): Promise<number> => (await db.tek<{ id: number }>(
  `INSERT INTO stok_raf (depo_id, kod, tur, numaralama, ilk_bolme, bolme_sayisi, kat_sayisi, bolme_genislik_m, derinlik_m, kat_araligi_m)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
  [r.depoId, r.kod, r.tur, r.numaralama, r.ilkBolme, r.bolmeSayisi, r.katSayisi, r.bolmeGenislikM, r.derinlikM, r.katAraligiM],
))!.id;
export const rafGuncelle = (db: Db, id: number, surum: number, r: Omit<RafAlanlari, 'depoId'>): Promise<{ id: number } | null> => db.tek(
  `UPDATE stok_raf SET kod = $3, tur = $4, numaralama = $5, ilk_bolme = $6, bolme_sayisi = $7, kat_sayisi = $8, bolme_genislik_m = $9,
     derinlik_m = $10, kat_araligi_m = $11, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id`,
  [id, surum, r.kod, r.tur, r.numaralama, r.ilkBolme, r.bolmeSayisi, r.katSayisi, r.bolmeGenislikM, r.derinlikM, r.katAraligiM],
);
export const rafPasifYap = (db: Db, id: number, surum: number): Promise<{ id: number } | null> =>
  db.tek('UPDATE stok_raf SET aktif = false, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum]);
export const rafVarMi = async (db: Db, id: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_raf WHERE id = $1', [id])) !== null;

// Gözler: önce raftaki bütün kodlar yeni önekle yenilenir, sonra istenen gözler açılır ya da etkinleşir, kalanı pasife alınır.
export const gozKodlariniYenile = (db: Db, rafId: number, yeniKod: string): Promise<unknown[]> =>
  db.sorgu(`UPDATE stok_konum SET kod = $2 || '-' || lpad(bolme_no::text, 2, '0') || '-' || lpad(kat_no::text, 2, '0'), surum = surum + 1
            WHERE raf_id = $1 AND kod <> $2 || '-' || lpad(bolme_no::text, 2, '0') || '-' || lpad(kat_no::text, 2, '0')`, [rafId, yeniKod]);
export const gozleriYaz = (db: Db, rafId: number, depoId: number, gozler: { bolmeNo: number; katNo: number; kod: string }[]): Promise<unknown[]> =>
  db.sorgu(
    `INSERT INTO stok_konum (depo_id, kod, tur, raf_id, bolme_no, kat_no)
     SELECT $2, g.kod, 'raf_gozu', $1, g.bolme, g.kat FROM unnest($3::text[], $4::int[], $5::int[]) AS g(kod, bolme, kat)
     ON CONFLICT ON CONSTRAINT stok_konum_raf_gozu_tek DO UPDATE SET aktif = true, surum = stok_konum.surum + 1 WHERE NOT stok_konum.aktif`,
    [rafId, depoId, gozler.map((g) => g.kod), gozler.map((g) => g.bolmeNo), gozler.map((g) => g.katNo)],
  );
export const fazlaGozleriKapat = (db: Db, rafId: number, gozler: { bolmeNo: number; katNo: number }[]): Promise<unknown[]> =>
  db.sorgu(
    `UPDATE stok_konum SET aktif = false, surum = surum + 1 WHERE raf_id = $1 AND aktif
       AND (bolme_no, kat_no) NOT IN (SELECT * FROM unnest($2::int[], $3::int[]))`,
    [rafId, gozler.map((g) => g.bolmeNo), gozler.map((g) => g.katNo)],
  );
export const rafGozleriniKapat = (db: Db, rafId: number): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_konum SET aktif = false, surum = surum + 1 WHERE raf_id = $1 AND aktif', [rafId]);
export interface GozHam {
  konumId: number; kod: string; bolmeNo: number; katNo: number; aktif: boolean; satirSayisi: number; ilkMalzemeId: number | null; ilkMiktar: string | null; sonSayim: string | null;
  ambalajlar: { tur: 'kasa' | 'koli' | 'palet' | 'bidon' | 'makara'; olcu: string; adet: number | null }[];
}
export const rafinGozleri = (db: Db, rafId: number): Promise<GozHam[]> => db.sorgu(
  `SELECT k.id AS "konumId", k.kod, k.bolme_no AS "bolmeNo", k.kat_no AS "katNo", k.aktif, ${zamanMetni('k.son_sayim')} AS "sonSayim",
     (SELECT count(*)::int FROM stok_bakiye b WHERE b.konum_id = k.id) AS "satirSayisi",
     ilk.malzeme_id AS "ilkMalzemeId", ilk.miktar AS "ilkMiktar",
     COALESCE((SELECT json_agg(json_build_object('tur', b.ambalaj_tur, 'olcu', b.ambalaj_olcu, 'adet', b.ambalaj_adet) ORDER BY b.id)
       FROM stok_bakiye b WHERE b.konum_id = k.id AND b.ambalaj_tur IS NOT NULL AND b.miktar > 0), '[]'::json) AS ambalajlar
   FROM stok_konum k
   LEFT JOIN LATERAL (SELECT b.malzeme_id, b.miktar FROM stok_bakiye b WHERE b.konum_id = k.id ORDER BY b.ilk_giris, b.id LIMIT 1) ilk ON true
   WHERE k.raf_id = $1 AND k.aktif ORDER BY k.kat_no DESC, k.bolme_no`,
  [rafId],
);
// ---- Konumdaki malzeme ve bekleme süresi (2224) -----------------------------------------------------------------------------
export type KonumMalzemesiHam = BakiyeHam & { konumAd: string | null };
export interface KonumMalzemesiSuzgeci { tur?: KonumTuru | undefined; metin?: string | undefined; malzemeId?: number | undefined }
const konumMalzemesiSuzgeci = (s: KonumMalzemesiSuzgeci): { sql: string; p: unknown[] } => ({
  sql: `WHERE k.aktif AND b.miktar > 0 AND ($1::text IS NULL OR k.tur = $1) AND ($2::int IS NULL OR b.malzeme_id = $2)
          AND ($3::text IS NULL OR ${S('k.kod')} LIKE $3 OR ${S('k.ad')} LIKE $3)`,
  p: [s.tur ?? null, s.malzemeId ?? null, icinde(s.metin)],
});
// Varsayılan sıra en eski geliş (en uzun bekleyen) önce; gelişi bilinmeyen satır sonda.
export const KONUM_MALZEMESI_SIRALAMASI: SiralamaTanimi<'gelis' | 'konum'> = {
  sutunlar: { gelis: 'b.konuma_gelis', konum: 'k.kod' }, ikincil: 'b.id', varsayilan: { sutun: 'b.konuma_gelis', yon: 'artan' },
};
export async function konumMalzemesiSay(db: Db, s: KonumMalzemesiSuzgeci): Promise<number> {
  const f = konumMalzemesiSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id ${f.sql}`, f.p))?.toplam ?? 0;
}
export function konumMalzemeleri(db: Db, s: KonumMalzemesiSuzgeci, sira: SiralamaIstegi<'gelis' | 'konum'>, d: Dilim): Promise<KonumMalzemesiHam[]> {
  const f = konumMalzemesiSuzgeci(s);
  return db.sorgu(
    `SELECT b.id, b.malzeme_id AS "malzemeId", b.konum_id AS "konumId", k.kod AS "konumKod", k.tur AS "konumTur", k.ad AS "konumAd", b.parti_id AS "partiId",
       p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.uretim_emri_id AS "uretimEmriId", b.miktar,
       ${zamanMetni('b.ilk_giris')} AS "ilkGiris", b.ambalaj_tur AS "ambalajTur", b.ambalaj_olcu AS "ambalajOlcu", b.ambalaj_adet AS "ambalajAdet",
       b.statu_id AS "statuId", b.kalite_durumu AS "kaliteDurumu", sk.son_kullanma AS "sonKullanma", ${zamanMetni('b.konuma_gelis')} AS "konumaGelis"
     FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
     LEFT JOIN stok_parti p ON p.id = b.parti_id LEFT JOIN stok_parti_son_kullanma sk ON sk.parti_id = b.parti_id
     ${f.sql}
     ORDER BY ${siralamaSql(KONUM_MALZEMESI_SIRALAMASI, sira)} LIMIT $4 OFFSET $5`,
    [...f.p, d.sinir, d.atla],
  );
}
// 2902: silinecek istasyonun konumu; hareketi ya da bakiyesi olan konumu yabancı anahtar korur (çağıran kayıt noktasında dener).
export const istasyonKonumunuSil = (db: Db, istasyonId: number): Promise<unknown[]> => db.sorgu('DELETE FROM stok_konum WHERE istasyon_id = $1 RETURNING id', [istasyonId]);
