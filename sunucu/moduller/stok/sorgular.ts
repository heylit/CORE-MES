import type { Db } from '#cekirdek/db.ts';
import type { Dilim, SiralamaIstegi } from '#cekirdek/liste.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { KaliteDurumu, KonumTuru, MalzemeIstegiDurumu, TeslimDurumu } from '#paylasilan/sozlesme/stok.ts';
import { AYRILMIS_KONUM_TURLERI, KULLANILABILIR_KALITE, KULLANILABILIR_KONUM_TURLERI, type DegerGrubu, type SevkBakiyesi } from './kurallar.ts';

// Sabit tür adları; kullanıcı girdisi değildir.
const AYRILMIS_SQL = AYRILMIS_KONUM_TURLERI.map((t) => `'${t}'`).join(', ');
const KULLANILABILIR_SQL = `kalite_durumu IN (${KULLANILABILIR_KALITE.map((t) => `'${t}'`).join(', ')})`;

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
}
export interface HareketHam {
  id: number; zaman: string; tur: 'giris' | 'cikis' | 'transfer' | 'sayim_fazla' | 'sayim_eksik' | 'geri_alma'; malzemeId: number; partiId: number | null;
  lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; partiEmirId: number | null; kaynakKonumId: number | null; hedefKonumId: number | null;
  kaynakKonumKod: string | null; hedefKonumKod: string | null; miktar: string; onayliEksi: boolean; girisKaynagi: 'mal_kabul' | 'uretim' | null;
  cikisNedeni: 'uretime_sarf' | 'sevk' | 'fire' | 'numune' | 'diger' | null; uretimEmriId: number | null; geriAlinanId: number | null;
  geriAlindi: boolean; malKabulSatiriMi: boolean; fisId: number | null; fisNo: string | null; kisiId: number; aciklama: string | null;
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
        AND ($3::text IS NULL OR k.kod ILIKE '%' || $3 || '%' OR k.ad ILIKE '%' || $3 || '%')`,
  p: [s.tur ?? null, s.rafId ?? null, s.metin ?? null],
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
export interface KonumKodu { id: number; kod: string; tur: KonumTuru; ad: string | null; bolmeNo: number | null; katNo: number | null; aktif: boolean }
export const kodDurumlari = (db: Db, s: { idler?: number[]; rafId?: number }): Promise<KonumKodu[]> =>
  db.sorgu(`SELECT id, kod, tur, ad, bolme_no AS "bolmeNo", kat_no AS "katNo", aktif FROM stok_konum WHERE id = ANY($1::int[]) OR raf_id = $2`,
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
const rafSuzgeci = (s: RafSuzgeci) => ({ sql: `FROM stok_raf r WHERE r.aktif AND ($1::text IS NULL OR r.tur = $1) AND ($2::text IS NULL OR r.kod ILIKE $2 || '%')`, p: [s.tur ?? null, s.metin ?? null] });
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

// ---- Bakiye ------------------------------------------------------------------------------------------------------------
const BAKIYE_SECIMI = `SELECT b.id, b.malzeme_id AS "malzemeId", b.konum_id AS "konumId", k.kod AS "konumKod", k.tur AS "konumTur", b.parti_id AS "partiId",
  p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.uretim_emri_id AS "uretimEmriId", b.miktar,
  ${zamanMetni('b.ilk_giris')} AS "ilkGiris", b.ambalaj_tur AS "ambalajTur", b.ambalaj_olcu AS "ambalajOlcu", b.ambalaj_adet AS "ambalajAdet", b.statu_id AS "statuId",
  b.kalite_durumu AS "kaliteDurumu"
  FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id LEFT JOIN stok_parti p ON p.id = b.parti_id`;
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
// Var olan parti yalnız emirle bulunur; mal kabulün her gelişi yeni lottur (#124).
export const emirPartisiBul = async (db: Db, malzemeId: number, uretimEmriId: number): Promise<number | null> =>
  (await db.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1 AND uretim_emri_id = $2', [malzemeId, uretimEmriId]))?.id ?? null;
// Eşzamanlı açışta ikincisi çakışmayı yakalar (null) ve var olanı okur.
export const partiAc = async (db: Db, p: PartiAnahtari & { lotNo: string }): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_parti (malzeme_id, tedarikci_parti_no, dokum_no, sertifika_no, uretim_emri_id, acan_kisi_id, lot_no)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (malzeme_id, uretim_emri_id) WHERE uretim_emri_id IS NOT NULL
     DO NOTHING RETURNING id`,
    [p.malzemeId, p.tedarikciPartiNo, p.dokumNo, p.sertifikaNo, p.uretimEmriId, p.kisiId, p.lotNo],
  ))?.id ?? null;
export const lotNoVarMi = async (db: Db, no: string): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_parti WHERE lot_no = $1', [no])) !== null;
export interface PartiSuzgeci { malzemeId?: number | undefined; metin?: string | undefined }
const partiSuzgeci = (s: PartiSuzgeci) => ({
  sql: `FROM stok_parti p WHERE ($1::int IS NULL OR p.malzeme_id = $1) AND ($2::text IS NULL OR p.lot_no ILIKE '%' || $2 || '%' OR p.tedarikci_parti_no ILIKE '%' || $2 || '%'
        OR p.dokum_no ILIKE '%' || $2 || '%' OR p.sertifika_no ILIKE '%' || $2 || '%')`,
  p: [s.malzemeId ?? null, s.metin ?? null],
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
export const hareketYaz = async (db: Db, h: HareketYeni): Promise<number> => (await db.tek<{ id: number }>(
  `INSERT INTO stok_hareketi (tur, malzeme_id, parti_id, parti_secimi, kaynak_konum_id, hedef_konum_id, miktar, onayli_eksi, eksi_onay_kaynagi,
     giris_kaynagi, cikis_nedeni, uretim_emri_id, geri_alinan_id, kisi_id, aciklama, kaynak_statu_id, hedef_statu_id, kaynak_kalite_durumu, hedef_kalite_durumu, is_emri_id)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 THEN 'kisi' END, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
  [h.tur, h.malzemeId, h.partiId, h.partiSecimi, h.kaynakKonumId, h.hedefKonumId, h.miktar, h.onayliEksi, h.girisKaynagi, h.cikisNedeni, h.uretimEmriId, h.geriAlinanId, h.kisiId, h.aciklama,
    h.kaynakStatuId, h.hedefStatuId, h.kaynakKaliteDurumu, h.hedefKaliteDurumu, h.isEmriId],
))!.id;
const HAREKET_SECIMI = `SELECT h.id, ${zamanMetni('h.zaman')} AS zaman, h.tur, h.malzeme_id AS "malzemeId", h.parti_id AS "partiId",
  p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.uretim_emri_id AS "partiEmirId",
  h.kaynak_konum_id AS "kaynakKonumId", h.hedef_konum_id AS "hedefKonumId", kk.kod AS "kaynakKonumKod", hk.kod AS "hedefKonumKod", h.miktar,
  h.onayli_eksi AS "onayliEksi", h.giris_kaynagi AS "girisKaynagi", h.cikis_nedeni AS "cikisNedeni", h.uretim_emri_id AS "uretimEmriId",
  h.geri_alinan_id AS "geriAlinanId", EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id) AS "geriAlindi",
  EXISTS (SELECT 1 FROM stok_mal_kabul_satiri s WHERE s.hareket_id = h.id OR s.fason_cikis_hareket_id = h.id) AS "malKabulSatiriMi", h.kisi_id AS "kisiId", h.aciklama,
  h.kaynak_statu_id AS "kaynakStatuId", h.hedef_statu_id AS "hedefStatuId", h.kaynak_kalite_durumu AS "kaynakKaliteDurumu",
  h.hedef_kalite_durumu AS "hedefKaliteDurumu", fs.fis_id AS "fisId", (SELECT f.no FROM stok_fis f WHERE f.id = fs.fis_id) AS "fisNo"`;
const HAREKET_BAGLARI = `FROM stok_hareketi h LEFT JOIN stok_parti p ON p.id = h.parti_id LEFT JOIN stok_fis_satiri fs ON fs.hareket_id = h.id
  LEFT JOIN stok_konum kk ON kk.id = h.kaynak_konum_id LEFT JOIN stok_konum hk ON hk.id = h.hedef_konum_id`;
export const hareketBul = (db: Db, id: number): Promise<HareketHam | null> => db.tek(`${HAREKET_SECIMI} ${HAREKET_BAGLARI} WHERE h.id = $1`, [id]);
export interface HareketSuzgeci {
  malzemeId?: number | undefined; konumId?: number | undefined; partiId?: number | undefined; tur?: string | undefined;
  uretimEmriId?: number | undefined; baslangic?: string | undefined; bitis?: string | undefined; metin?: string | undefined;
}
const hareketSuzgeci = (s: HareketSuzgeci) => ({
  sql: `${HAREKET_BAGLARI} WHERE ($1::int IS NULL OR h.malzeme_id = $1) AND ($2::int IS NULL OR h.kaynak_konum_id = $2 OR h.hedef_konum_id = $2)
        AND ($3::bigint IS NULL OR h.parti_id = $3) AND ($4::text IS NULL OR h.tur = $4) AND ($5::int IS NULL OR h.uretim_emri_id = $5)
        AND ($6::timestamptz IS NULL OR h.zaman >= $6) AND ($7::timestamptz IS NULL OR h.zaman < $7)
        AND ($8::text IS NULL OR h.aciklama ILIKE '%' || $8 || '%' OR kk.kod ILIKE '%' || $8 || '%' OR hk.kod ILIKE '%' || $8 || '%'
          OR p.lot_no ILIKE '%' || $8 || '%' OR p.tedarikci_parti_no ILIKE '%' || $8 || '%' OR p.dokum_no ILIKE '%' || $8 || '%')`,
  p: [s.malzemeId ?? null, s.konumId ?? null, s.partiId ?? null, s.tur ?? null, s.uretimEmriId ?? null, s.baslangic ?? null, s.bitis ?? null, s.metin ?? null],
});
export const suzgecVarMi = (s: HareketSuzgeci): boolean => Object.values(s).some((v) => v !== undefined);
export const HAREKET_SIRALAMASI: SiralamaTanimi<'zaman'> = { sutunlar: { zaman: 'h.zaman' }, ikincil: 'h.id', varsayilan: { sutun: 'h.zaman', yon: 'azalan' } };
export async function hareketSay(db: Db, s: HareketSuzgeci): Promise<number> {
  const f = hareketSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${f.sql}`, f.p))?.toplam ?? 0;
}
export function hareketler(db: Db, s: HareketSuzgeci, sira: SiralamaIstegi<'zaman'>, d: Dilim): Promise<HareketHam[]> {
  const f = hareketSuzgeci(s);
  return db.sorgu(`${HAREKET_SECIMI} ${f.sql} ORDER BY ${siralamaSql(HAREKET_SIRALAMASI, sira)} LIMIT $9 OFFSET $10`, [...f.p, d.sinir, d.atla]);
}

// ---- Malzeme gözüyle stok ----------------------------------------------------------------------------------------------------
// serbest: statüsüz bakiye (kritik seviye ona göre); statülü miktar üretimdeki yarı parçadır, kullanılabilir stok sayılmaz.
export interface MalzemeStokHam { malzemeId: number; toplam: string; serbest: string; kritikSeviye: string | null; konumSayisi: number; konumlar: { kod: string; katNo: number | null; miktar: string }[] }
// adlaBulunan: metnin ad ya da stok koduyla eşleştiği kartlar (malzemeler `malzemeAra`); kart tablosu stokun değil.
export interface MalzemeSuzgeci { durum?: 'kritik' | 'eksi' | 'kabulde' | undefined; metin?: string | undefined; adlaBulunan?: number[] | undefined }
const KONUM_ETIKETLERI = (malzeme: string): string => `COALESCE((SELECT json_agg(json_build_object('kod', x.kod, 'katNo', x.kat_no, 'miktar', x.miktar::text) ORDER BY x.miktar DESC)
  FROM (SELECT k.kod, k.kat_no, b.miktar FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE b.malzeme_id = ${malzeme} ORDER BY b.miktar DESC, k.kod LIMIT 3) x), '[]'::json)`;
const MALZEME_KAYNAGI = `FROM (SELECT malzeme_id FROM stok_bakiye UNION SELECT malzeme_id FROM stok_malzeme_ayari) m
  LEFT JOIN stok_malzeme_ayari a ON a.malzeme_id = m.malzeme_id
  LEFT JOIN LATERAL (SELECT COALESCE(sum(b.miktar), 0) AS toplam, COALESCE(sum(b.miktar) FILTER (WHERE b.statu_id IS NULL AND b.${KULLANILABILIR_SQL}), 0) AS serbest, count(DISTINCT b.konum_id)::int AS konumlar, bool_or(b.miktar < 0) AS eksi,
      bool_or(k.tur = 'kabul') AS kabulde FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE b.malzeme_id = m.malzeme_id) t ON true`;
const malzemeSuzgeci = (s: MalzemeSuzgeci) => ({
  sql: `${MALZEME_KAYNAGI} WHERE ($1::text IS NULL OR ($1 = 'kritik' AND a.kritik_seviye IS NOT NULL AND t.serbest <= a.kritik_seviye)
        OR ($1 = 'eksi' AND t.eksi) OR ($1 = 'kabulde' AND t.kabulde))
        AND ($2::text IS NULL OR m.malzeme_id::text = $2 OR m.malzeme_id = ANY($3::int[]) OR EXISTS (SELECT 1 FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
          LEFT JOIN stok_parti p ON p.id = b.parti_id WHERE b.malzeme_id = m.malzeme_id
          AND (k.kod ILIKE '%' || $2 || '%' OR p.lot_no ILIKE '%' || $2 || '%' OR p.tedarikci_parti_no ILIKE '%' || $2 || '%' OR p.dokum_no ILIKE '%' || $2 || '%')))`,
  p: [s.durum ?? null, s.metin ?? null, s.adlaBulunan ?? []],
});
export const MALZEME_SIRALAMASI: SiralamaTanimi<'malzeme' | 'toplam'> = { sutunlar: { malzeme: 'm.malzeme_id', toplam: 't.toplam' }, ikincil: 'm.malzeme_id' };
export async function malzemeSay(db: Db, s: MalzemeSuzgeci): Promise<number> {
  const f = malzemeSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${f.sql}`, f.p))?.toplam ?? 0;
}
export function malzemeStoklari(db: Db, s: MalzemeSuzgeci, sira: SiralamaIstegi<'malzeme' | 'toplam'>, d: Dilim): Promise<MalzemeStokHam[]> {
  const f = malzemeSuzgeci(s);
  return db.sorgu(
    `SELECT m.malzeme_id AS "malzemeId", t.toplam::text AS toplam, t.serbest::text AS serbest, a.kritik_seviye AS "kritikSeviye", t.konumlar AS "konumSayisi",
       ${KONUM_ETIKETLERI('m.malzeme_id')} AS konumlar ${f.sql}
     ORDER BY ${siralamaSql(MALZEME_SIRALAMASI, sira)} LIMIT $4 OFFSET $5`, [...f.p, d.sinir, d.atla]);
}
export const kartStoklari = (db: Db, idler: readonly number[]): Promise<MalzemeStokHam[]> => db.sorgu(
  `SELECT m.id AS "malzemeId", COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = m.id), 0)::text AS toplam,
     COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = m.id AND statu_id IS NULL AND ${KULLANILABILIR_SQL}), 0)::text AS serbest,
     (SELECT kritik_seviye FROM stok_malzeme_ayari WHERE malzeme_id = m.id) AS "kritikSeviye",
     (SELECT count(DISTINCT konum_id)::int FROM stok_bakiye WHERE malzeme_id = m.id) AS "konumSayisi",
     ${KONUM_ETIKETLERI('m.id')} AS konumlar
   FROM unnest($1::int[]) WITH ORDINALITY AS m(id, sira) ORDER BY m.sira`, [idler]);
export const malzemeStoku = (db: Db, malzemeId: number): Promise<MalzemeStokHam | null> => db.tek(
  `SELECT $1::int AS "malzemeId", COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = $1), 0)::text AS toplam,
     COALESCE((SELECT sum(miktar) FROM stok_bakiye WHERE malzeme_id = $1 AND statu_id IS NULL AND ${KULLANILABILIR_SQL}), 0)::text AS serbest,
     (SELECT kritik_seviye FROM stok_malzeme_ayari WHERE malzeme_id = $1) AS "kritikSeviye",
     (SELECT count(DISTINCT konum_id)::int FROM stok_bakiye WHERE malzeme_id = $1) AS "konumSayisi",
     ${KONUM_ETIKETLERI('$1')} AS konumlar`, [malzemeId]);
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
const MAL_KABUL_SECIMI = `SELECT m.id, m.no, m.tur, m.irsaliye_no AS "irsaliyeNo", ${zamanMetni('m.zaman')} AS zaman, m.kisi_id AS "kisiId",
  (SELECT count(*)::int FROM stok_mal_kabul_satiri s WHERE s.mal_kabul_id = m.id) AS "satirSayisi",
  (SELECT count(*)::int FROM stok_mal_kabul_satiri s WHERE s.mal_kabul_id = m.id AND s.logo_durumu = 'fark_var') AS "farkSayisi",
  m.duzeltilen_id AS "duzeltilenId", (SELECT d.id FROM stok_mal_kabul d WHERE d.duzeltilen_id = m.id) AS "duzeltenId"`;
export const malKabulAc = async (db: Db, b: { no: string; tur: string; irsaliyeNo: string | null; duzeltilenId: number | null; kisiId: number }): Promise<number> =>
  (await db.tek<{ id: number }>('INSERT INTO stok_mal_kabul (no, tur, irsaliye_no, duzeltilen_id, kisi_id) VALUES ($1, $2, $3, $4, $5) RETURNING id', [b.no, b.tur, b.irsaliyeNo, b.duzeltilenId, b.kisiId]))!.id;
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
  konumId: number | null; konumKod: string | null; hareketId: number | null; emirAdimi: boolean;
  fasonCikisHareketId: number | null; fasonMalzemeId: number | null; fasonMiktar: string | null; fasonKonumId: number | null; fasonKonumKod: string | null; logoDurumu: 'irsaliye_bekleniyor' | 'eslesti' | 'fark_var'; logoIrsaliyeSatirNo: number | null; logoIrsaliyeMiktari: string | null;
}
export const malKabulSatirlari = (db: Db, id: number): Promise<MalKabulSatirHam[]> => db.sorgu(
  `SELECT s.id, s.siparis_satir_id AS "siparisSatirId", s.sira, s.malzeme_id AS "malzemeId", s.sayilan_miktar AS "sayilanMiktar", s.parti_id AS "partiId", p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo",
     p.dokum_no AS "dokumNo", p.uretim_emri_id AS "partiEmirId", s.konum_id AS "konumId", k.kod AS "konumKod", s.hareket_id AS "hareketId",
     EXISTS (SELECT 1 FROM stok_hareketi h WHERE h.id = s.hareket_id AND h.giris_kaynagi IS DISTINCT FROM 'mal_kabul') AS "emirAdimi",
     s.fason_cikis_hareket_id AS "fasonCikisHareketId", f.malzeme_id AS "fasonMalzemeId", f.miktar::text AS "fasonMiktar", f.kaynak_konum_id AS "fasonKonumId", fk.kod AS "fasonKonumKod",
     s.logo_durumu AS "logoDurumu", s.logo_irsaliye_satir_no AS "logoIrsaliyeSatirNo", s.logo_irsaliye_miktari AS "logoIrsaliyeMiktari"
   FROM stok_mal_kabul_satiri s LEFT JOIN stok_konum k ON k.id = s.konum_id LEFT JOIN stok_parti p ON p.id = s.parti_id
     LEFT JOIN stok_hareketi f ON f.id = s.fason_cikis_hareket_id LEFT JOIN stok_konum fk ON fk.id = f.kaynak_konum_id
   WHERE s.mal_kabul_id = $1 ORDER BY s.sira`, [id]);
export interface MalKabulSuzgeci { tur?: string | undefined; logoDurumu?: string | undefined; baslangic?: string | undefined; bitis?: string | undefined; metin?: string | undefined }
const malKabulSuzgeci = (s: MalKabulSuzgeci) => ({
  sql: `FROM stok_mal_kabul m WHERE ($1::text IS NULL OR m.tur = $1)
        AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM stok_mal_kabul_satiri s WHERE s.mal_kabul_id = m.id AND s.logo_durumu = $2))
        AND ($3::timestamptz IS NULL OR m.zaman >= $3) AND ($4::timestamptz IS NULL OR m.zaman < $4)
        AND ($5::text IS NULL OR m.no ILIKE '%' || $5 || '%' OR m.irsaliye_no ILIKE '%' || $5 || '%')`,
  p: [s.tur ?? null, s.logoDurumu ?? null, s.baslangic ?? null, s.bitis ?? null, s.metin ?? null],
});
export const MAL_KABUL_SIRALAMASI: SiralamaTanimi<'zaman' | 'no'> = { sutunlar: { zaman: 'm.zaman', no: 'm.id' }, ikincil: 'm.id', varsayilan: { sutun: 'm.zaman', yon: 'azalan' } };
export async function malKabulSay(db: Db, s: MalKabulSuzgeci): Promise<number> {
  const f = malKabulSuzgeci(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${f.sql}`, f.p))?.toplam ?? 0;
}
export function malKabuller(db: Db, s: MalKabulSuzgeci, sira: SiralamaIstegi<'zaman' | 'no'>, d: Dilim): Promise<MalKabulHam[]> {
  const f = malKabulSuzgeci(s);
  return db.sorgu(`${MAL_KABUL_SECIMI} ${f.sql} ORDER BY ${siralamaSql(MAL_KABUL_SIRALAMASI, sira)} LIMIT $6 OFFSET $7`, [...f.p, d.sinir, d.atla]);
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
export const degerGrubuMalzemeToplamlari = (db: Db): Promise<{ malzemeId: number; grup: DegerGrubu; toplam: string }[]> =>
  db.sorgu(`SELECT b.malzeme_id AS "malzemeId",
              CASE WHEN k.tur IN ('hurda', 'fason') THEN k.tur WHEN k.tur IN ('yolda', 'sevkiyat') THEN 'yolda'
                   WHEN k.tur = 'karantina' OR NOT b.${KULLANILABILIR_SQL} THEN 'kalite'
                   WHEN k.tur = ANY($1::text[]) AND b.statu_id IS NULL THEN 'kullanilabilir' ELSE 'diger' END AS grup,
              sum(b.miktar)::text AS toplam
              FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id GROUP BY 1, 2 ORDER BY 1, 2`, [KULLANILABILIR_KONUM_TURLERI]);
// Ay sonu (içinde bulunulan ay için bugün) malzeme toplamları: bugünkü bakiyeden ay sonundan sonraki hareketlerin net etkisi düşülür.
// Hedefi olan hareket o miktarı ekler, kaynağı olan düşer; transfer toplamı değiştirmez. Her ay en az bir satırla döner; toplamı sıfırın üstünde kart yoksa kart ve toplam null'dır.
export const aySonuMalzemeToplamlari = (db: Db, ay: number): Promise<{ ay: string; malzemeId: number | null; toplam: string | null }[]> => db.sorgu(
  `WITH aylar AS (
     SELECT a::date AS ay, CASE WHEN a < date_trunc('month', now()) THEN a + interval '1 month' END AS son
     FROM generate_series(date_trunc('month', now()) - make_interval(months => $1::int - 1), date_trunc('month', now()), interval '1 month') AS a),
   simdi AS (SELECT malzeme_id, sum(miktar) AS m FROM stok_bakiye GROUP BY malzeme_id),
   net AS (
     SELECT a.ay, h.malzeme_id, sum(CASE WHEN h.hedef_konum_id IS NULL THEN 0 ELSE h.miktar END - CASE WHEN h.kaynak_konum_id IS NULL THEN 0 ELSE h.miktar END) AS n
     FROM aylar a JOIN stok_hareketi h ON h.zaman >= a.son GROUP BY a.ay, h.malzeme_id),
   kartlar AS (SELECT malzeme_id FROM simdi UNION SELECT malzeme_id FROM net)
   SELECT to_char(a.ay, 'YYYY-MM') AS ay, x."malzemeId", x.toplam
   FROM aylar a LEFT JOIN LATERAL (
     SELECT k.malzeme_id AS "malzemeId", (COALESCE(s.m, 0) - COALESCE(n.n, 0))::text AS toplam
     FROM kartlar k LEFT JOIN simdi s ON s.malzeme_id = k.malzeme_id LEFT JOIN net n ON n.ay = a.ay AND n.malzeme_id = k.malzeme_id
     WHERE COALESCE(s.m, 0) - COALESCE(n.n, 0) > 0) x ON true
   ORDER BY a.ay, x."malzemeId"`, [ay]);
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
}
// Statü çevirme ve sevk çıkışı emri taşımaz; emrin partisi ve emrin teslimleri üzerinden bulunur. UNION tekrarı atar.
export const emrinAkisHareketleri = (db: Db, emirId: number): Promise<AkisHareketi[]> => db.sorgu(
  `WITH kimlikler AS (
     SELECT id FROM stok_hareketi WHERE uretim_emri_id = $1
     UNION SELECT h.id FROM stok_hareketi h JOIN stok_parti p ON p.id = h.parti_id WHERE p.uretim_emri_id = $1
     UNION SELECT t.hareket_id FROM stok_teslim t WHERE t.uretim_emri_id = $1 AND t.hareket_id IS NOT NULL)
   SELECT h.id::int, ${zamanMetni('h.zaman')} AS zaman, h.tur, h.malzeme_id AS "malzemeId", h.parti_id::int AS "partiId", h.miktar::text AS miktar,
     h.kaynak_statu_id AS "kaynakStatuId", h.hedef_statu_id AS "hedefStatuId", h.giris_kaynagi AS "girisKaynagi", h.cikis_nedeni AS "cikisNedeni",
     kk.tur AS "kaynakKonumTur", hk.tur AS "hedefKonumTur", h.geri_alinan_id::int AS "geriAlinanId"
   FROM kimlikler i JOIN stok_hareketi h ON h.id = i.id
   LEFT JOIN stok_konum kk ON kk.id = h.kaynak_konum_id LEFT JOIN stok_konum hk ON hk.id = h.hedef_konum_id
   ORDER BY h.zaman, h.id`, [emirId]);
// Partinin en eski mal kabul zamanı; mal kabulle girmemiş parti (üretim partisi) null taşır.
export const partiGirisZamanlari = (db: Db, partiIdler: number[]): Promise<{ partiId: number; lotNo: string; malKabulZamani: string | null }[]> => db.sorgu(
  `SELECT p.id::int AS "partiId", p.lot_no AS "lotNo", ${zamanMetni('min(m.zaman)')} AS "malKabulZamani"
   FROM stok_parti p LEFT JOIN stok_mal_kabul_satiri s ON s.parti_id = p.id LEFT JOIN stok_mal_kabul m ON m.id = s.mal_kabul_id
   WHERE p.id = ANY($1::bigint[]) GROUP BY p.id, p.lot_no`, [partiIdler]);
// Tedarikçi partileri (üretim partisi değil), yeniden eskiye; liste ekranı için sınırlı.
export const sonPartiler = (db: Db, malzemeId: number, sinir: number): Promise<{ partiId: number; lotNo: string; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null; kayitZamani: string }[]> => db.sorgu(
  `SELECT p.id::int AS "partiId", p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.sertifika_no AS "sertifikaNo", ${zamanMetni('p.kayit_zamani')} AS "kayitZamani"
   FROM stok_parti p WHERE p.malzeme_id = $1 AND p.uretim_emri_id IS NULL ORDER BY p.kayit_zamani DESC, p.id DESC LIMIT $2`, [malzemeId, sinir]);
// Aynı emrin tamamlaması sıraya girer: ikinci istek ilk işlem bitince yeniden hesaplar (kilit işlem sonunda bırakılır).
export const emirTamamlamaKilidi = async (db: Db, emirId: number): Promise<void> => {
  await db.sorgu("SELECT pg_advisory_xact_lock(hashtext('stok_emir_tamamlama'), $1)", [emirId]);
};
// Emrin ürününden üretim girişiyle giren net miktar: üretim girişinin geri alması kaynaktan düşer (hedefi yoktur).
export const emirUretimGirisi = async (db: Db, emirId: number, malzemeId: number): Promise<string> => (await db.sorgu<{ miktar: string }>(
  `SELECT COALESCE(sum(CASE WHEN tur = 'giris' THEN miktar ELSE -miktar END), 0)::text AS miktar FROM stok_hareketi
   WHERE uretim_emri_id = $1 AND malzeme_id = $2
     AND (giris_kaynagi = 'uretim' OR (tur = 'geri_alma' AND kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NULL))`, [emirId, malzemeId]))[0]?.miktar ?? '0';
export const konumKodlari = (db: Db, idler: number[]): Promise<{ id: number; kod: string }[]> =>
  db.sorgu('SELECT id, kod FROM stok_konum WHERE id = ANY($1::int[])', [idler]);
// Bakiyenin hareket toplamına eşitliği (DEP-11): fark veren eksenler.
export const bakiyeDefterFarki = (db: Db): Promise<{ malzemeId: number; konumId: number; partiId: number | null; bakiye: string; defter: string }[]> => db.sorgu(
  `WITH defter AS (
     SELECT malzeme_id, konum_id, parti_id, statu_id, kalite_durumu, sum(etki) AS toplam FROM (
       SELECT malzeme_id, hedef_konum_id AS konum_id, parti_id, hedef_statu_id AS statu_id, COALESCE(hedef_kalite_durumu, 'serbest') AS kalite_durumu, miktar AS etki
         FROM stok_hareketi WHERE hedef_konum_id IS NOT NULL
       UNION ALL SELECT malzeme_id, kaynak_konum_id, parti_id, kaynak_statu_id, COALESCE(kaynak_kalite_durumu, 'serbest'), -miktar FROM stok_hareketi WHERE kaynak_konum_id IS NOT NULL) x
     GROUP BY malzeme_id, konum_id, parti_id, statu_id, kalite_durumu)
   SELECT COALESCE(b.malzeme_id, d.malzeme_id) AS "malzemeId", COALESCE(b.konum_id, d.konum_id) AS "konumId", COALESCE(b.parti_id, d.parti_id) AS "partiId",
     COALESCE(b.miktar, 0)::text AS bakiye, COALESCE(d.toplam, 0)::text AS defter
   FROM stok_bakiye b FULL JOIN defter d ON d.malzeme_id = b.malzeme_id AND d.konum_id = b.konum_id AND d.parti_id IS NOT DISTINCT FROM b.parti_id
     AND d.statu_id IS NOT DISTINCT FROM b.statu_id AND d.kalite_durumu = b.kalite_durumu
   WHERE COALESCE(b.miktar, 0) <> COALESCE(d.toplam, 0)`);

// ---- Sepet ve fiş ----------------------------------------------------------------------------------------------------------
export interface SepetHam { id: number; malzemeId: number; kaynakKonumId: number | null; kaynakKonumKod: string | null; partiId: number | null; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; partiEmirId: number | null; miktar: string; eklenme: string }
const SEPET_SECIMI = `SELECT s.id, s.malzeme_id AS "malzemeId", s.kaynak_konum_id AS "kaynakKonumId", k.kod AS "kaynakKonumKod", s.parti_id AS "partiId",
  p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.uretim_emri_id AS "partiEmirId", s.miktar, ${zamanMetni('s.eklenme')} AS eklenme
  FROM stok_sepet_satiri s LEFT JOIN stok_konum k ON k.id = s.kaynak_konum_id LEFT JOIN stok_parti p ON p.id = s.parti_id`;
export const sepetSatirlari = (db: Db, kisiId: number, kilit = false): Promise<SepetHam[]> =>
  db.sorgu(`${SEPET_SECIMI} WHERE s.kisi_id = $1 ORDER BY s.id${kilit ? ' FOR UPDATE OF s' : ''}`, [kisiId]);
export const sepeteEkle = async (db: Db, s: { kisiId: number; malzemeId: number; kaynakKonumId: number | null; partiId: number | null; miktar: string }): Promise<number> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_sepet_satiri (kisi_id, malzeme_id, kaynak_konum_id, parti_id, miktar) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT stok_sepet_satiri_tek DO UPDATE SET miktar = stok_sepet_satiri.miktar + EXCLUDED.miktar RETURNING id`,
    [s.kisiId, s.malzemeId, s.kaynakKonumId, s.partiId, s.miktar],
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
const TESLIM_SECIMI = `SELECT t.id, t.no, t.kaynak_kimligi AS "kaynakKimligi", t.malzeme_id AS "malzemeId", t.miktar, t.parti_id AS "partiId", t.statu_id AS "statuId",
  t.kalite_durumu AS "kaliteDurumu", t.kaynak_konum_id AS "kaynakKonumId", t.hedef_konum_id AS "hedefKonumId", t.uretim_emri_id AS "uretimEmriId", t.istek_id AS "istekId", t.aciklama, t.durum,
  t.alinan, t.red_nedeni AS "redNedeni", t.hareket_id AS "hareketId", t.gonderen_kisi_id AS "gonderenKisiId", t.kapatan_kisi_id AS "kapatanKisiId", t.alici_kisi_id AS "aliciKisiId",
  ${zamanMetni('t.gonderim')} AS gonderim, ${zamanMetni('t.kapanis')} AS kapanis, t.surum, t.okutarak, ${zamanMetni('t.itiraz_sonu')} AS "itirazSonu",
  t.itiraz_nedeni AS "itirazNedeni", t.itiraz_kisi_id AS "itirazKisiId", ${zamanMetni('t.itiraz_zamani')} AS "itirazZamani", t.iade_teslim_id AS "iadeTeslimId" FROM stok_teslim t`;
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
  db.sorgu("SELECT id, kod, ad, tur FROM stok_konum WHERE aktif AND tur <> 'istasyon' AND ad ILIKE '%' || $1 || '%' ORDER BY id", [sozcuk]);
// Teslim hedefi olabilen depo konumları: rafsız depo alanları (kabul, depo zemini); raf gözüne yerleştirme depo işidir.
export const teslimDepoKonumlari = (db: Db): Promise<{ id: number; kod: string; ad: string | null }[]> =>
  db.sorgu("SELECT id, kod, ad FROM stok_konum WHERE aktif AND tur IN ('kabul', 'depo_zemini') ORDER BY kod");
export const teslimAraAlanlari = (db: Db): Promise<{ id: number; kod: string; ad: string | null }[]> =>
  db.sorgu("SELECT id, kod, ad FROM stok_konum WHERE aktif AND tur = 'ara_alan' ORDER BY kod");
export const konumdakiPartiler = async (db: Db, malzemeId: number, konumId: number, statuId: number | null, kalite: KaliteDurumu = 'serbest'): Promise<(number | null)[]> =>
  (await db.sorgu<{ partiId: number | null }>(
    'SELECT parti_id AS "partiId" FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id IS NOT DISTINCT FROM $3 AND kalite_durumu = $4 ORDER BY ilk_giris, id',
    [malzemeId, konumId, statuId, kalite])).map((r) => r.partiId);
export const teslimVarMi = async (db: Db, id: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_teslim WHERE id = $1', [id])) !== null;
// Gelenler: yoldaki teslimler; hedefIstasyonlar null ise bütün istasyonlar, depoDahil ise istasyon olmayan hedefler de.
export const yoldakiGelenler = (db: Db, hedefIstasyonlar: number[] | null, depoDahil: boolean): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} JOIN stok_konum h ON h.id = t.hedef_konum_id
    WHERE t.durum = 'yolda' AND ((h.istasyon_id IS NOT NULL AND ($1::int[] IS NULL OR h.istasyon_id = ANY($1::int[]))) OR ($2 AND h.istasyon_id IS NULL))
    ORDER BY t.gonderim, t.id LIMIT 100`, [hedefIstasyonlar, depoDahil]);
// Kapsamdaki istasyonlardan okutarak alınmış, itiraz süresi bitmemiş teslimler (soru 96 b, telafi 3); null ise bütün istasyonlar.
export const okutarakAlinanlar = (db: Db, kaynakIstasyonlar: number[] | null): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} JOIN stok_konum k ON k.id = t.kaynak_konum_id
    WHERE t.okutarak AND t.durum = 'teslim' AND t.itiraz_nedeni IS NULL AND t.itiraz_sonu > now()
      AND k.istasyon_id IS NOT NULL AND ($1::int[] IS NULL OR k.istasyon_id = ANY($1::int[]))
    ORDER BY t.kapanis DESC, t.id DESC LIMIT 50`, [kaynakIstasyonlar]);
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
export const teslimKapat = (db: Db, id: number, surum: number, k: { durum: 'teslim' | 'red' | 'iptal'; alinan: string | null; redNedeni: string | null; hareketId: number | null; kisiId: number }): Promise<{ id: number } | null> =>
  db.tek(
    `UPDATE stok_teslim SET durum = $3, alinan = $4, red_nedeni = $5, hareket_id = $6, kapatan_kisi_id = $7, kapanis = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 AND durum = 'yolda' RETURNING id`,
    [id, surum, k.durum, k.alinan, k.redNedeni, k.hareketId, k.kisiId]);
// Kaynaktaki yoldaki teslimler (kart #1410): gönderim ve kullanım bunları düşerek serbest miktarı bulur.
export const yoldaAyrilan = async (db: Db, malzemeId: number, konumId: number, partiId: number | null, statuId: number | null, kalite: KaliteDurumu = 'serbest'): Promise<string> =>
  (await db.tek<{ m: string }>(`SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_teslim WHERE durum = 'yolda' AND kaynak_konum_id = $2 AND malzeme_id = $1
    AND parti_id IS NOT DISTINCT FROM $3 AND statu_id IS NOT DISTINCT FROM $4 AND kalite_durumu = $5`, [malzemeId, konumId, partiId, statuId, kalite]))!.m;
export const konumdakiYoldaAyrilanlar = (db: Db, konumId: number): Promise<{ malzemeId: number; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string }[]> =>
  db.sorgu(`SELECT malzeme_id AS "malzemeId", parti_id AS "partiId", statu_id AS "statuId", kalite_durumu AS "kaliteDurumu", sum(miktar)::text AS miktar FROM stok_teslim
    WHERE durum = 'yolda' AND kaynak_konum_id = $1 GROUP BY malzeme_id, parti_id, statu_id, kalite_durumu`, [konumId]);
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
export const konumAra = (db: Db, q: string): Promise<{ konumId: number; kod: string; ad: string | null; satirSayisi: number }[]> => db.sorgu(
  `SELECT k.id AS "konumId", k.kod, k.ad, (SELECT count(*)::int FROM stok_bakiye b WHERE b.konum_id = k.id) AS "satirSayisi"
   FROM stok_konum k WHERE k.aktif AND (k.kod ILIKE $1 || '%' OR k.kod ILIKE '%-' || $1 OR k.ad ILIKE '%' || $1 || '%')
   ORDER BY (k.kod = upper($1)) DESC, k.kod LIMIT 6`, [q]);
export const rafAra = (db: Db, q: string): Promise<{ rafId: number; kod: string; rafTuru: 'palet' | 'celik' | 'konsol' | 'zemin' }[]> =>
  db.sorgu(`SELECT id AS "rafId", kod, tur AS "rafTuru" FROM stok_raf WHERE aktif AND (kod = upper($1) OR 'RAF ' || kod = upper($1)) ORDER BY id LIMIT 3`, [q]);
export const partiAra = (db: Db, q: string): Promise<{ partiId: number; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; uretimEmriId: number | null; malzemeId: number }[]> => db.sorgu(
  `SELECT id AS "partiId", lot_no AS "lotNo", tedarikci_parti_no AS "tedarikciPartiNo", dokum_no AS "dokumNo", uretim_emri_id AS "uretimEmriId", malzeme_id AS "malzemeId"
   FROM stok_parti WHERE lot_no ILIKE '%' || $1 || '%' OR tedarikci_parti_no ILIKE '%' || $1 || '%' OR dokum_no ILIKE '%' || $1 || '%' ORDER BY kayit_zamani DESC LIMIT 4`, [q]);

// Sayım bekleyen dolu raf gözü: hiç sayılmamış ya da son sayımı süreden eski (DEP-15).
export const sayimBekleyenGozler = (db: Db, gun: number): Promise<{ konumId: number; kod: string; sonSayim: string | null }[]> => db.sorgu(
  `SELECT k.id AS "konumId", k.kod, ${zamanMetni('k.son_sayim')} AS "sonSayim" FROM stok_konum k
   WHERE k.tur = 'raf_gozu' AND k.aktif AND EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.konum_id = k.id)
     AND (k.son_sayim IS NULL OR k.son_sayim < now() - make_interval(days => $1::int))
   ORDER BY k.son_sayim NULLS FIRST, k.kod LIMIT 200`, [gun]);

// Kart #1124: sipariş satırlarına bağlı mal kabul belgeleri; düzeltilmiş (yerine yenisi gelmiş) belge listede yoktur.
export const siparisIrsaliyeleri = (db: Db, siparisSatirIdler: readonly number[]): Promise<{ siparisSatirId: number; malKabulId: number; malKabulNo: string; irsaliyeNo: string | null; zaman: string }[]> => db.sorgu(
  `SELECT DISTINCT s.siparis_satir_id AS "siparisSatirId", m.id AS "malKabulId", m.no AS "malKabulNo", m.irsaliye_no AS "irsaliyeNo", ${zamanMetni('m.zaman')} AS zaman
     FROM stok_mal_kabul_satiri s JOIN stok_mal_kabul m ON m.id = s.mal_kabul_id
    WHERE s.siparis_satir_id = ANY($1::int[]) AND NOT EXISTS (SELECT 1 FROM stok_mal_kabul d WHERE d.duzeltilen_id = m.id)
    ORDER BY zaman, "malKabulId"`, [siparisSatirIdler]);

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
  await db.sorgu("SELECT pg_advisory_xact_lock(hashtext('stok_rezerve'), $1)", [malzemeId]);
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

// ---- Refakat partisi (kart #123): emir + depodan verilen lot ------------------------------------------------------------
export interface RefakatPartisiHam {
  id: number; uretimEmriId: number; sira: number; malzemeId: number; partiId: number; lotNo: string; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null;
  durum: 'acik' | 'iptal'; surum: number; kayitZamani: string; verilen: string;
}
// Verilen: partinin emrine o lottan yapılan teslimler; alınan teslimde alınan, yoldakinde gönderilen miktar.
const REFAKAT_SECIMI = `SELECT r.id, r.uretim_emri_id AS "uretimEmriId", r.sira, r.malzeme_id AS "malzemeId", r.parti_id AS "partiId", p.lot_no AS "lotNo",
  p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.sertifika_no AS "sertifikaNo", r.durum, r.surum, ${zamanMetni('r.kayit_zamani')} AS "kayitZamani",
  (SELECT COALESCE(sum(CASE t.durum WHEN 'teslim' THEN t.alinan ELSE t.miktar END), 0) FROM stok_teslim t
    WHERE t.uretim_emri_id = r.uretim_emri_id AND t.parti_id = r.parti_id AND t.durum IN ('yolda', 'teslim'))::text AS verilen
  FROM stok_refakat_partisi r JOIN stok_parti p ON p.id = r.parti_id`;
export const refakatPartisiBul = (db: Db, id: number, kilit = false): Promise<RefakatPartisiHam | null> =>
  db.tek(`${REFAKAT_SECIMI} WHERE r.id = $1${kilit ? ' FOR UPDATE OF r' : ''}`, [id]);
export const acikRefakatPartisi = (db: Db, uretimEmriId: number, partiId: number): Promise<RefakatPartisiHam | null> =>
  db.tek(`${REFAKAT_SECIMI} WHERE r.uretim_emri_id = $1 AND r.parti_id = $2 AND r.durum = 'acik'`, [uretimEmriId, partiId]);
export const emrinRefakatPartileri = (db: Db, uretimEmriId: number): Promise<RefakatPartisiHam[]> =>
  db.sorgu(`${REFAKAT_SECIMI} WHERE r.uretim_emri_id = $1 ORDER BY r.sira`, [uretimEmriId]);
// Sıra emir başına artar; aynı emre eşzamanlı iki açılış sırayla girer (kilit işlem sonunda bırakılır).
export const refakatPartisiAc = async (db: Db, r: { uretimEmriId: number; malzemeId: number; partiId: number; kisiId: number }): Promise<number | null> => {
  await db.sorgu("SELECT pg_advisory_xact_lock(hashtext('stok_refakat_partisi'), $1)", [r.uretimEmriId]);
  return (await db.tek<{ id: number }>(
    `INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id)
     SELECT $1, COALESCE(max(sira), 0) + 1, $2, $3, $4 FROM stok_refakat_partisi WHERE uretim_emri_id = $1
     ON CONFLICT (uretim_emri_id, parti_id) WHERE durum = 'acik' DO NOTHING RETURNING id`,
    [r.uretimEmriId, r.malzemeId, r.partiId, r.kisiId]))?.id ?? null;
};
export const refakatPartisiIptal = (db: Db, id: number, surum: number, kisiId: number): Promise<{ id: number } | null> =>
  db.tek(
    `UPDATE stok_refakat_partisi SET durum = 'iptal', iptal_eden_kisi_id = $3, iptal_zamani = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 AND durum = 'acik' RETURNING id`, [id, surum, kisiId]);
export const refakatPartisiVarMi = async (db: Db, id: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_refakat_partisi WHERE id = $1', [id])) !== null;
// Partinin emrine o lottan yoldaki teslimler; alan taraf kartı okutunca bunlardan kendisine geleni alır (Soru 118 a).
export const refakatYoldakiTeslimleri = (db: Db, uretimEmriId: number, partiId: number): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} WHERE t.durum = 'yolda' AND t.uretim_emri_id = $1 AND t.parti_id = $2 ORDER BY t.gonderim, t.id`, [uretimEmriId, partiId]);
// Lotun, açık refakat kartı olan emre yoldaki teslimleri: alan taraf lotu değil kartı okutur (kullanıcı akışı 14:16).
export const kartliYoldakiTeslimler = (db: Db, partiId: number): Promise<TeslimHam[]> =>
  db.sorgu(`${TESLIM_SECIMI} JOIN stok_refakat_partisi r ON r.uretim_emri_id = t.uretim_emri_id AND r.parti_id = t.parti_id AND r.durum = 'acik'
    WHERE t.durum = 'yolda' AND t.parti_id = $1 ORDER BY t.gonderim, t.id`, [partiId]);
