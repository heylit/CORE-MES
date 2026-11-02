import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaIstegi, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { BagModulu, BelgeTuru, RevizyonDurumu } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';

export interface BelgeKaydi {
  id: number;
  ad: string;
  tur: BelgeTuru;
  aciklama: string | null;
  resimNo: string | null;
  aktif: boolean;
  surum: number;
  olusturanId: number;
  olusturuldu: string;
  guncellendi: string;
}

const BELGE_SECIMI = `b.id, b.ad, b.tur, b.aciklama, b.resim_no AS "resimNo", b.aktif, b.surum, b.olusturan_id AS "olusturanId",
  ${zamanMetni('b.olusturuldu')} AS olusturuldu, ${zamanMetni('b.guncellendi')} AS guncellendi`;

export function belge(db: Db, id: number): Promise<BelgeKaydi | null> {
  return db.tek<BelgeKaydi>(`SELECT ${BELGE_SECIMI} FROM belge_merkezi_belge b WHERE b.id = $1`, [id]);
}

// Belgeye dokunan her komut önce belgeyi kilitler: revizyon sırası ve yayın tekliği eşzamanlı komutta karışmaz.
export function belgeKilitle(db: Db, id: number): Promise<BelgeKaydi | null> {
  return db.tek<BelgeKaydi>(`SELECT ${BELGE_SECIMI} FROM belge_merkezi_belge b WHERE b.id = $1 FOR UPDATE`, [id]);
}

export async function belgeEkle(
  db: Db, b: { ad: string; tur: BelgeTuru; aciklama: string | null; resimNo: string | null; kisiId: number },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    'INSERT INTO belge_merkezi_belge (ad, tur, aciklama, resim_no, olusturan_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [b.ad, b.tur, b.aciklama, b.resimNo, b.kisiId],
  );
  if (satir === null) throw new Error('Belge eklenemedi');
  return satir.id;
}

// Sürüm tutmazsa satır dönmez; çağıran `surumluGuncelle` ile 404/409 ayırır. Belgeye dokunan her yazma sürümü artırır.
export function belgeSurumuArtir(db: Db, id: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'UPDATE belge_merkezi_belge SET surum = surum + 1, guncellendi = now() WHERE id = $1 AND surum = $2 RETURNING id',
    [id, surum],
  );
}

export function belgeGuncelle(
  db: Db, id: number, surum: number, g: { ad: string; aciklama: string | null; resimNo: string | null },
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE belge_merkezi_belge SET ad = $3, aciklama = $4, resim_no = $5, surum = surum + 1, guncellendi = now()
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, g.ad, g.aciklama, g.resimNo],
  );
}

export function belgeAktifligi(db: Db, id: number, surum: number, aktif: boolean): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'UPDATE belge_merkezi_belge SET aktif = $3, surum = surum + 1, guncellendi = now() WHERE id = $1 AND surum = $2 RETURNING id',
    [id, surum, aktif],
  );
}

export async function belgeVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM belge_merkezi_belge WHERE id = $1', [id])) !== null;
}

export interface RevizyonKaydi {
  id: number;
  belgeId: number;
  sira: number;
  ozet: string;
  dosyaTuru: DosyaTuru;
  durum: RevizyonDurumu;
  not: string | null;
  antetRev: string | null;
  yukleyenId: number;
  yuklendi: string;
  yayinlayanId: number | null;
  yayinlandi: string | null;
}

const REVIZYON_SECIMI = `r.id, r.belge_id AS "belgeId", r.sira, r.ozet, r.dosya_turu AS "dosyaTuru", r.durum, r."not", r.antet_rev AS "antetRev",
  r.yukleyen_id AS "yukleyenId", ${zamanMetni('r.yuklendi')} AS yuklendi, r.yayinlayan_id AS "yayinlayanId",
  ${zamanMetni('r.yayinlandi')} AS yayinlandi`;

export function revizyonlar(db: Db, belgeId: number): Promise<RevizyonKaydi[]> {
  return db.sorgu<RevizyonKaydi>(`SELECT ${REVIZYON_SECIMI} FROM belge_merkezi_revizyon r WHERE r.belge_id = $1 ORDER BY r.sira DESC`, [belgeId]);
}

export function revizyon(db: Db, belgeId: number, revizyonId: number): Promise<RevizyonKaydi | null> {
  return db.tek<RevizyonKaydi>(`SELECT ${REVIZYON_SECIMI} FROM belge_merkezi_revizyon r WHERE r.belge_id = $1 AND r.id = $2`, [belgeId, revizyonId]);
}

export function yayindakiRevizyon(db: Db, belgeId: number): Promise<RevizyonKaydi | null> {
  return db.tek<RevizyonKaydi>(`SELECT ${REVIZYON_SECIMI} FROM belge_merkezi_revizyon r WHERE r.belge_id = $1 AND r.durum = 'yayinda'`, [belgeId]);
}

// Yayına girmiş (yayında ya da eski) revizyon, özetle; aynı dosya iki revizyonda varsa sonuncusu. Taslak dışarıya verilmez.
export function yayinlanmisRevizyonOzetle(db: Db, belgeId: number, ozet: string): Promise<RevizyonKaydi | null> {
  return db.tek<RevizyonKaydi>(
    `SELECT ${REVIZYON_SECIMI} FROM belge_merkezi_revizyon r WHERE r.belge_id = $1 AND r.ozet = $2 AND r.durum <> 'taslak' ORDER BY r.sira DESC LIMIT 1`,
    [belgeId, ozet],
  );
}

export async function sonrakiSira(db: Db, belgeId: number): Promise<number> {
  const satir = await db.tek<{ sira: number }>('SELECT COALESCE(max(sira), 0) + 1 AS sira FROM belge_merkezi_revizyon WHERE belge_id = $1', [belgeId]);
  return satir?.sira ?? 1;
}

export async function revizyonSayisi(db: Db, belgeId: number): Promise<number> {
  const satir = await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM belge_merkezi_revizyon WHERE belge_id = $1', [belgeId]);
  return satir?.n ?? 0;
}

export async function revizyonEkle(
  db: Db, r: { belgeId: number; sira: number; ozet: string; dosyaTuru: DosyaTuru; not: string | null; antetRev: string | null; kisiId: number },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO belge_merkezi_revizyon (belge_id, sira, ozet, dosya_turu, "not", antet_rev, yukleyen_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [r.belgeId, r.sira, r.ozet, r.dosyaTuru, r.not, r.antetRev, r.kisiId],
  );
  if (satir === null) throw new Error('Revizyon eklenemedi');
  return satir.id;
}

// Yayındaki revizyon eskir, seçilen yayına geçer; ikisi aynı komutta (yayında tekliği dizinle de korunur).
export async function revizyonYayinla(db: Db, belgeId: number, revizyonId: number, kisiId: number): Promise<void> {
  await db.sorgu("UPDATE belge_merkezi_revizyon SET durum = 'eski' WHERE belge_id = $1 AND durum = 'yayinda'", [belgeId]);
  await db.sorgu(
    "UPDATE belge_merkezi_revizyon SET durum = 'yayinda', yayinlayan_id = $3, yayinlandi = now() WHERE belge_id = $1 AND id = $2",
    [belgeId, revizyonId, kisiId],
  );
}

export async function revizyonSil(db: Db, belgeId: number, revizyonId: number): Promise<void> {
  await db.sorgu('DELETE FROM belge_merkezi_revizyon WHERE belge_id = $1 AND id = $2', [belgeId, revizyonId]);
}

export interface BagKaydi {
  hedefModul: BagModulu;
  hedefId: number;
  ekleyenId: number;
  eklendi: string;
  kapak: boolean;
}

export function baglar(db: Db, belgeId: number): Promise<BagKaydi[]> {
  return db.sorgu<BagKaydi>(
    `SELECT hedef_modul AS "hedefModul", hedef_id AS "hedefId", ekleyen_id AS "ekleyenId", ${zamanMetni('eklendi')} AS eklendi, kapak
       FROM belge_merkezi_bag WHERE belge_id = $1 ORDER BY hedef_modul, hedef_id`,
    [belgeId],
  );
}

export async function bagEkle(db: Db, belgeId: number, hedefModul: BagModulu, hedefId: number, kisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO belge_merkezi_bag (belge_id, hedef_modul, hedef_id, ekleyen_id) VALUES ($1, $2, $3, $4)', [belgeId, hedefModul, hedefId, kisiId]);
}

export async function bagSil(db: Db, belgeId: number, hedefModul: BagModulu, hedefId: number): Promise<boolean> {
  const silinen = await db.sorgu('DELETE FROM belge_merkezi_bag WHERE belge_id = $1 AND hedef_modul = $2 AND hedef_id = $3 RETURNING belge_id', [belgeId, hedefModul, hedefId]);
  return silinen.length > 0;
}

export interface BelgeListeSatiri {
  id: number;
  ad: string;
  tur: BelgeTuru;
  aktif: boolean;
  yayindakiSira: number | null;
  sonSira: number;
  dosyaTuru: DosyaTuru;
  bagSayisi: number;
  guncellendi: string;
  surum: number;
}

export type BelgeSiralamasi = 'ad' | 'guncellendi';
export const SIRALAMA: SiralamaTanimi<BelgeSiralamasi> = {
  sutunlar: { ad: 'b.ad', guncellendi: 'b.guncellendi' },
  ikincil: 'b.id',
  varsayilan: { sutun: 'b.guncellendi', yon: 'azalan' },
};

export interface BelgeSuzgeci {
  ara: string | null;
  tur: BelgeTuru | null;
  aktif: boolean;
  // null: süzülmez; true: istasyona bağlı; false: istasyona bağlı değil.
  makine: boolean | null;
}

// Arama adda (büyük-küçük harf duyarsız) geçer; joker karakterler düz metin sayılır.
const KOSUL = `WHERE b.aktif = $1 AND ($2::text IS NULL OR b.tur = $2)
    AND ($3::text IS NULL OR b.ad ILIKE '%' || $3 || '%' ESCAPE '\\')
    AND ($4::boolean IS NULL OR $4 = EXISTS (SELECT 1 FROM belge_merkezi_bag g WHERE g.belge_id = b.id AND g.hedef_modul = 'istasyonlar'))`;
const kosulParametreleri = (s: BelgeSuzgeci): unknown[] => [s.aktif, s.tur, s.ara === null ? null : s.ara.replace(/[\\%_]/g, (c) => `\\${c}`), s.makine];

export async function belgeSay(db: Db, s: BelgeSuzgeci): Promise<number> {
  const satir = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM belge_merkezi_belge b ${KOSUL}`, kosulParametreleri(s));
  return satir?.toplam ?? 0;
}

export function belgeSatirlari(db: Db, s: BelgeSuzgeci, siralama: SiralamaIstegi<BelgeSiralamasi>, dilim: Dilim): Promise<BelgeListeSatiri[]> {
  return db.sorgu<BelgeListeSatiri>(
    `SELECT b.id, b.ad, b.tur, b.aktif, b.surum, ${zamanMetni('b.guncellendi')} AS guncellendi,
            y.sira AS "yayindakiSira", s.sira AS "sonSira", s.dosya_turu AS "dosyaTuru",
            (SELECT count(*)::int FROM belge_merkezi_bag g WHERE g.belge_id = b.id) AS "bagSayisi"
       FROM belge_merkezi_belge b
       JOIN LATERAL (SELECT r.sira, r.dosya_turu FROM belge_merkezi_revizyon r WHERE r.belge_id = b.id ORDER BY r.sira DESC LIMIT 1) s ON true
       LEFT JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
     ${KOSUL}
      ORDER BY ${siralamaSql(SIRALAMA, siralama)} LIMIT $5 OFFSET $6`,
    [...kosulParametreleri(s), dilim.sinir, dilim.atla],
  );
}

// İkinci menü sayacı: etkin belgeler türüne göre, arşiv ayrı.
export function sayaclar(db: Db): Promise<{ tur: BelgeTuru; aktif: boolean; n: number }[]> {
  return db.sorgu('SELECT tur, aktif, count(*)::int AS n FROM belge_merkezi_belge GROUP BY tur, aktif');
}

export interface BagliBelgeSatiri {
  id: number;
  ad: string;
  tur: BelgeTuru;
  yayindakiRevizyonId: number | null;
  yayindakiSira: number | null;
  dosyaTuru: DosyaTuru | null;
  ozet: string | null;
}

// Bir kayda bağlı etkin belgeler ve yayındaki revizyonları (yalnız taslağı olan belge de listelenir, revizyonu null).
export function bagliBelgeler(db: Db, hedefModul: BagModulu, hedefId: number): Promise<BagliBelgeSatiri[]> {
  return db.sorgu<BagliBelgeSatiri>(
    `SELECT b.id, b.ad, b.tur, y.id AS "yayindakiRevizyonId", y.sira AS "yayindakiSira", y.dosya_turu AS "dosyaTuru", y.ozet
       FROM belge_merkezi_bag g
       JOIN belge_merkezi_belge b ON b.id = g.belge_id AND b.aktif
       LEFT JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
      WHERE g.hedef_modul = $1 AND g.hedef_id = $2
      ORDER BY b.ad, b.id`,
    [hedefModul, hedefId],
  );
}

// Aynısı birden çok kayıt için tek sorguda; satır hangi kayda bağlı olduğunu taşır.
export function bagliBelgelerToplu(db: Db, hedefModul: BagModulu, hedefIdler: readonly number[]): Promise<(BagliBelgeSatiri & { hedefId: number })[]> {
  return db.sorgu<BagliBelgeSatiri & { hedefId: number }>(
    `SELECT g.hedef_id AS "hedefId", b.id, b.ad, b.tur, y.id AS "yayindakiRevizyonId", y.sira AS "yayindakiSira", y.dosya_turu AS "dosyaTuru", y.ozet
       FROM belge_merkezi_bag g
       JOIN belge_merkezi_belge b ON b.id = g.belge_id AND b.aktif
       LEFT JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
      WHERE g.hedef_modul = $1 AND g.hedef_id = ANY($2::int[])
      ORDER BY g.hedef_id, b.ad, b.id`,
    [hedefModul, [...hedefIdler]],
  );
}

export interface YayindakiBelgeSatiri {
  id: number;
  ad: string;
  tur: BelgeTuru;
  yayindakiRevizyonId: number;
  yayindakiSira: number;
  dosyaTuru: DosyaTuru;
  ozet: string;
}

// Seçici listesi: yayında revizyonu olan etkin belgeler, ada göre. Arama `belgeSatirlari` ile aynı kuraldadır.
export function yayindakiBelgeler(db: Db, s: { tur: BelgeTuru | null; ara: string | null; sinir: number }): Promise<YayindakiBelgeSatiri[]> {
  const ara = s.ara === null ? null : s.ara.replace(/[\\%_]/g, (c) => `\\${c}`);
  return db.sorgu<YayindakiBelgeSatiri>(
    `SELECT b.id, b.ad, b.tur, y.id AS "yayindakiRevizyonId", y.sira AS "yayindakiSira", y.dosya_turu AS "dosyaTuru", y.ozet
       FROM belge_merkezi_belge b
       JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
      WHERE b.aktif AND ($1::text IS NULL OR b.tur = $1)
        AND ($2::text IS NULL OR b.ad ILIKE '%' || $2 || '%' ESCAPE '\\')
      ORDER BY b.ad, b.id LIMIT $3`,
    [s.tur, ara, s.sinir],
  );
}

// Bir modülün kayıtlarına bağlı, yayındaki revizyonu verilen dosya türlerinden olan etkin belgeler; kayıt sırasıyla. Taslak ya da arşivdeki
// belge gelmez. Kayıt kimliği bilinmeden çağrılır: listeyi bağı olan kayıtlar oluşturur.
export function bagliYayindakiBelgeler(
  db: Db, hedefModul: BagModulu, dosyaTurleri: readonly DosyaTuru[],
): Promise<(YayindakiBelgeSatiri & { hedefId: number })[]> {
  return db.sorgu<YayindakiBelgeSatiri & { hedefId: number }>(
    `SELECT g.hedef_id AS "hedefId", b.id, b.ad, b.tur, y.id AS "yayindakiRevizyonId", y.sira AS "yayindakiSira", y.dosya_turu AS "dosyaTuru", y.ozet
       FROM belge_merkezi_bag g
       JOIN belge_merkezi_belge b ON b.id = g.belge_id AND b.aktif
       JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
      WHERE g.hedef_modul = $1 AND y.dosya_turu = ANY($2::text[])
      ORDER BY g.hedef_id, b.ad, b.id`,
    [hedefModul, [...dosyaTurleri]],
  );
}

export interface AramaSatiri {
  id: number;
  ad: string;
  tur: BelgeTuru;
  resimNo: string | null;
  yayindakiSira: number;
}

// Genel arama: adda ya da resim numarasında geçen, yayında revizyonu olan etkin belgeler. Tam resim no önce, sonra baştan
// eşleşen, sonra yeniden eskiye. Sütun ve sorgu aynı Türkçe sadeleştirmeden geçer (`public.arama_sade`, dil ayarından bağımsız);
// desenler sadeleşmiş ve kaçırılmış gelir (`#paylasilan/kayit-aramasi.ts`). LIKE '%x%' trigram ifade indeksine düşer (göç 20261029132000).
export function aramaSatirlari(db: Db, s: { sade: string; icinde: string; bas: string; sinir: number }): Promise<AramaSatiri[]> {
  return db.sorgu<AramaSatiri>(
    `SELECT b.id, b.ad, b.tur, b.resim_no AS "resimNo", y.sira AS "yayindakiSira"
       FROM belge_merkezi_belge b
       JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
      WHERE b.aktif AND (public.arama_sade(b.resim_no) LIKE $1 OR public.arama_sade(b.ad) LIKE $1)
      ORDER BY (public.arama_sade(b.resim_no) = $2) IS TRUE DESC,
               (public.arama_sade(b.resim_no) LIKE $3 OR public.arama_sade(b.ad) LIKE $3) IS TRUE DESC,
               b.guncellendi DESC, b.id DESC
      LIMIT $4`,
    [s.icinde, s.sade, s.bas, s.sinir],
  );
}

// Belgenin revizyonları için kare sayısı; karesi olmayan revizyon haritada yoktur.
export async function onizlemeSayilari(db: Db, belgeId: number): Promise<Map<number, number>> {
  const satirlar = await db.sorgu<{ revizyonId: number; n: number }>(
    `SELECT o.revizyon_id AS "revizyonId", count(*)::int AS n
       FROM belge_merkezi_onizleme o JOIN belge_merkezi_revizyon r ON r.id = o.revizyon_id
      WHERE r.belge_id = $1 GROUP BY o.revizyon_id`,
    [belgeId],
  );
  return new Map(satirlar.map((s) => [s.revizyonId, s.n]));
}

export async function onizlemeSil(db: Db, revizyonId: number): Promise<void> {
  await db.sorgu('DELETE FROM belge_merkezi_onizleme WHERE revizyon_id = $1', [revizyonId]);
}

export async function onizlemeEkle(db: Db, o: { revizyonId: number; kare: number; ozet: string; kisiId: number }): Promise<void> {
  await db.sorgu('INSERT INTO belge_merkezi_onizleme (revizyon_id, kare, ozet, kisi_id) VALUES ($1, $2, $3, $4)', [o.revizyonId, o.kare, o.ozet, o.kisiId]);
}

export function onizlemeKaresi(db: Db, belgeId: number, revizyonId: number, kare: number): Promise<{ ozet: string } | null> {
  return db.tek<{ ozet: string }>(
    `SELECT o.ozet FROM belge_merkezi_onizleme o JOIN belge_merkezi_revizyon r ON r.id = o.revizyon_id
      WHERE r.belge_id = $1 AND o.revizyon_id = $2 AND o.kare = $3`,
    [belgeId, revizyonId, kare],
  );
}

export interface KayitOnizlemesi {
  belgeId: number;
  revizyonId: number;
  kareler: number[];
}

// Kayda bağlı etkin 3B model belgelerinden, yayındaki revizyonunda karesi olan ilki: bağın eklenme sırası, eşitse belge kimliği.
export function kayitOnizlemesi(db: Db, hedefModul: BagModulu, hedefId: number): Promise<KayitOnizlemesi | null> {
  return db.tek<KayitOnizlemesi>(
    `SELECT b.id AS "belgeId", y.id AS "revizyonId", array_agg(o.kare::int ORDER BY o.kare) AS kareler
       FROM belge_merkezi_bag g
       JOIN belge_merkezi_belge b ON b.id = g.belge_id AND b.aktif AND b.tur = '3b-model'
       JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
       JOIN belge_merkezi_onizleme o ON o.revizyon_id = y.id
      WHERE g.hedef_modul = $1 AND g.hedef_id = $2
      GROUP BY g.eklendi, b.id, y.id
      ORDER BY g.eklendi, b.id LIMIT 1`,
    [hedefModul, hedefId],
  );
}

// Kare, revizyon o kayda bağlı etkin belgenin yayındaki revizyonuysa okunur.
export function yayindakiOnizlemeKaresi(
  db: Db, hedefModul: BagModulu, hedefId: number, revizyonId: number, kare: number,
): Promise<{ belgeId: number; ozet: string } | null> {
  return db.tek<{ belgeId: number; ozet: string }>(
    `SELECT y.belge_id AS "belgeId", o.ozet
       FROM belge_merkezi_onizleme o
       JOIN belge_merkezi_revizyon y ON y.id = o.revizyon_id AND y.durum = 'yayinda'
       JOIN belge_merkezi_belge b ON b.id = y.belge_id AND b.aktif
       JOIN belge_merkezi_bag g ON g.belge_id = b.id AND g.hedef_modul = $1 AND g.hedef_id = $2
      WHERE o.revizyon_id = $3 AND o.kare = $4`,
    [hedefModul, hedefId, revizyonId, kare],
  );
}

export async function bagVarMi(db: Db, belgeId: number, hedefModul: BagModulu, hedefId: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM belge_merkezi_bag WHERE belge_id = $1 AND hedef_modul = $2 AND hedef_id = $3', [belgeId, hedefModul, hedefId])) !== null;
}

// Kayıt başına tek kapak (kısmi tekil dizin): önce kaydın kapağı kalkar, sonra seçilen işaretlenir. Tekil dizin satır satır
// denetlendiği için ikisi tek UPDATE'te yapılmaz.
export async function kapakYaz(db: Db, hedefModul: BagModulu, hedefId: number, belgeId: number): Promise<void> {
  await db.sorgu('UPDATE belge_merkezi_bag SET kapak = false WHERE hedef_modul = $1 AND hedef_id = $2 AND kapak', [hedefModul, hedefId]);
  await db.sorgu('UPDATE belge_merkezi_bag SET kapak = true WHERE hedef_modul = $1 AND hedef_id = $2 AND belge_id = $3', [hedefModul, hedefId, belgeId]);
}

export interface KucukResimAdayi {
  hedefId: number;
  belgeId: number;
  tur: BelgeTuru;
  resimNo: string | null;
  kapak: boolean;
  eklendi: string;
  revizyonId: number;
  durum: RevizyonDurumu;
  sira: number;
  antetRev: string | null;
  kareSayisi: number;
}

// Kayıtlara bağlı etkin belgelerin yayına girmiş (taslak olmayan) revizyonları ve kare sayıları; tek sorguda.
export function kucukResimAdaylari(db: Db, hedefModul: BagModulu, hedefIdler: readonly number[]): Promise<KucukResimAdayi[]> {
  return db.sorgu<KucukResimAdayi>(
    `SELECT g.hedef_id AS "hedefId", b.id AS "belgeId", b.tur, b.resim_no AS "resimNo", g.kapak, ${zamanMetni('g.eklendi')} AS eklendi,
            r.id AS "revizyonId", r.durum, r.sira, r.antet_rev AS "antetRev",
            (SELECT count(*)::int FROM belge_merkezi_onizleme o WHERE o.revizyon_id = r.id) AS "kareSayisi"
       FROM belge_merkezi_bag g
       JOIN belge_merkezi_belge b ON b.id = g.belge_id AND b.aktif
       JOIN belge_merkezi_revizyon r ON r.belge_id = b.id AND r.durum <> 'taslak'
      WHERE g.hedef_modul = $1 AND g.hedef_id = ANY($2::int[])
      ORDER BY g.hedef_id, b.id, r.sira`,
    [hedefModul, [...hedefIdler]],
  );
}

// Küçük resim karesi: revizyon yayına girmiş, belgesi etkin ve bir kayda bağlıysa okunur. Taslağın karesi verilmez.
export function kucukResimKaresi(db: Db, revizyonId: number, kare: number): Promise<{ belgeId: number; ozet: string } | null> {
  return db.tek<{ belgeId: number; ozet: string }>(
    `SELECT r.belge_id AS "belgeId", o.ozet
       FROM belge_merkezi_onizleme o
       JOIN belge_merkezi_revizyon r ON r.id = o.revizyon_id AND r.durum <> 'taslak'
       JOIN belge_merkezi_belge b ON b.id = r.belge_id AND b.aktif
      WHERE o.revizyon_id = $1 AND o.kare = $2 AND EXISTS (SELECT 1 FROM belge_merkezi_bag g WHERE g.belge_id = b.id)`,
    [revizyonId, kare],
  );
}

// Teknik resim numarası uyan, kayda bağlı olmayan etkin belgeler (malzeme kartının bağlama önerisi).
export function resimNoyaUyanBelgeler(
  db: Db, resimNo: string, hedefModul: BagModulu, hedefId: number,
): Promise<{ id: number; ad: string; tur: BelgeTuru; surum: number }[]> {
  return db.sorgu(
    `SELECT b.id, b.ad, b.tur, b.surum FROM belge_merkezi_belge b
      WHERE b.aktif AND b.resim_no IS NOT NULL AND upper(b.resim_no) = upper($1)
        AND NOT EXISTS (SELECT 1 FROM belge_merkezi_bag g WHERE g.belge_id = b.id AND g.hedef_modul = $2 AND g.hedef_id = $3)
      ORDER BY b.ad, b.id LIMIT 20`,
    [resimNo.trim(), hedefModul, hedefId],
  );
}
