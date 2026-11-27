import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaIstegi, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import type { BagModulu, BelgeTuru, Kullanim, RevizyonDurumu, TurevGirdisi } from '#paylasilan/sozlesme/belge-merkezi.ts';
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
  // 3468-2: türevde üçü dolu, orijinalde üçü null (göçteki kısıt).
  kaynakBelgeId: number | null;
  kaynakRevizyonId: number | null;
  kullanim: Kullanim | null;
}

const BELGE_SECIMI = `b.id, b.ad, b.tur, b.aciklama, b.resim_no AS "resimNo", b.aktif, b.surum, b.olusturan_id AS "olusturanId",
  ${zamanMetni('b.olusturuldu')} AS olusturuldu, ${zamanMetni('b.guncellendi')} AS guncellendi,
  b.kaynak_belge_id AS "kaynakBelgeId", b.kaynak_revizyon_id AS "kaynakRevizyonId", b.kullanim`;

export function belge(db: Db, id: number): Promise<BelgeKaydi | null> {
  return db.tek<BelgeKaydi>(`SELECT ${BELGE_SECIMI} FROM belge_merkezi_belge b WHERE b.id = $1`, [id]);
}

// Belgeye dokunan her komut önce belgeyi kilitler: revizyon sırası ve yayın tekliği eşzamanlı komutta karışmaz.
export function belgeKilitle(db: Db, id: number): Promise<BelgeKaydi | null> {
  return db.tek<BelgeKaydi>(`SELECT ${BELGE_SECIMI} FROM belge_merkezi_belge b WHERE b.id = $1 FOR UPDATE`, [id]);
}

export async function belgeEkle(
  db: Db, b: { ad: string; tur: BelgeTuru; aciklama: string | null; resimNo: string | null; kisiId: number; turev?: TurevGirdisi | null },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO belge_merkezi_belge (ad, tur, aciklama, resim_no, olusturan_id, kaynak_belge_id, kaynak_revizyon_id, kullanim)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [b.ad, b.tur, b.aciklama, b.resimNo, b.kisiId, b.turev?.kaynakBelgeId ?? null, b.turev?.kaynakRevizyonId ?? null, b.turev?.kullanim ?? null],
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

// 3468-2: türev bağını yazar ya da (null) kaldırır; sürüm çağıranın `surumuIlerlet`iyle ilerler.
export async function turevYaz(db: Db, id: number, t: TurevGirdisi | null): Promise<void> {
  await db.sorgu(
    'UPDATE belge_merkezi_belge SET kaynak_belge_id = $2, kaynak_revizyon_id = $3, kullanim = $4, guncellendi = now() WHERE id = $1',
    [id, t?.kaynakBelgeId ?? null, t?.kaynakRevizyonId ?? null, t?.kullanim ?? null],
  );
}

export async function turevSayisi(db: Db, kaynakBelgeId: number): Promise<number> {
  const satir = await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM belge_merkezi_belge WHERE kaynak_belge_id = $1', [kaynakBelgeId]);
  return satir?.n ?? 0;
}

export interface TurevSatiri {
  id: number;
  ad: string;
  kullanim: Kullanim;
  aktif: boolean;
  kaynakBelgeId: number;
  kaynakRevizyonId: number;
  kaynakDurumu: RevizyonDurumu;
  yayindakiRevizyonId: number | null;
  yayindakiSira: number | null;
  dosyaTuru: DosyaTuru | null;
  ozet: string | null;
}

// Kaynak belgelerin türevleri ve türevin yayındaki revizyonu (yalnız taslağı olan türevde null).
export function turevler(db: Db, kaynakBelgeIdler: readonly number[]): Promise<TurevSatiri[]> {
  return db.sorgu<TurevSatiri>(
    `SELECT b.id, b.ad, b.kullanim, b.aktif, b.kaynak_belge_id AS "kaynakBelgeId", b.kaynak_revizyon_id AS "kaynakRevizyonId",
            kr.durum AS "kaynakDurumu", y.id AS "yayindakiRevizyonId", y.sira AS "yayindakiSira", y.dosya_turu AS "dosyaTuru", y.ozet
       FROM belge_merkezi_belge b
       JOIN belge_merkezi_revizyon kr ON kr.id = b.kaynak_revizyon_id
       LEFT JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
      WHERE b.kaynak_belge_id = ANY($1::int[])
      ORDER BY b.kaynak_belge_id, b.kullanim, b.ad, b.id`,
    [[...kaynakBelgeIdler]],
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

// Özet etkin bir belgenin yayındaki revizyonunun dosyası mı (Arkon, Çizim Merkezi'nden eklenen dosyanın okunması, 2520-3).
export async function yayindaOzetMi(db: Db, ozet: string): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM belge_merkezi_revizyon r JOIN belge_merkezi_belge b ON b.id = r.belge_id
                     WHERE r.ozet = $1 AND r.durum = 'yayinda' AND b.aktif) AS var`,
    [ozet],
  );
  return satir?.var ?? false;
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

// 3324 a: belge ve bütün satırları; sıra yabancı anahtarlara göre (önizleme, revizyon, bağ, belge). Yayına girmiş revizyonu
// tetikleyici reddeder; dışarıdan belgeye bağlı satır (Kalite resmi) yabancı anahtarla durdurur.
export async function belgeSil(db: Db, id: number): Promise<void> {
  await db.sorgu('DELETE FROM belge_merkezi_onizleme o USING belge_merkezi_revizyon r WHERE r.id = o.revizyon_id AND r.belge_id = $1', [id]);
  await db.sorgu('DELETE FROM belge_merkezi_revizyon WHERE belge_id = $1', [id]);
  await db.sorgu('DELETE FROM belge_merkezi_bag WHERE belge_id = $1', [id]);
  await db.sorgu('DELETE FROM belge_merkezi_belge WHERE id = $1', [id]);
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
  kullanim: Kullanim | null;
  kaynakBelgeId: number | null;
  kaynakAd: string | null;
  kaynakSira: number | null;
  kaynakDurumu: RevizyonDurumu | null;
  turevSayisi: number;
}

// 3468-2 (D): türev orijinalinin altında durur. Sıralama orijinalin değeriyle yapılır (türev için k, kaynak belge); grup anahtarı
// orijinalin kimliğidir, grupta önce orijinal sonra türevler ada göre gelir (`GRUP_ICI`, yönden bağımsız; satır sırası tekildir).
export type BelgeSiralamasi = 'ad' | 'guncellendi';
export const SIRALAMA: SiralamaTanimi<BelgeSiralamasi> = {
  sutunlar: { ad: 'COALESCE(k.ad, b.ad)', guncellendi: 'COALESCE(k.guncellendi, b.guncellendi)' },
  ikincil: 'COALESCE(k.id, b.id)',
  varsayilan: { sutun: 'COALESCE(k.guncellendi, b.guncellendi)', yon: 'azalan' },
};
const GRUP_ICI = '(b.kaynak_belge_id IS NOT NULL) ASC, b.ad ASC, b.id ASC';

export interface BelgeSuzgeci {
  ara: string | null;
  tur: BelgeTuru | null;
  aktif: boolean;
  // null: süzülmez; true: istasyona bağlı; false: istasyona bağlı değil.
  makine: boolean | null;
  // 3468-2: 'orijinal' türev olmayanlar, kullanım adı o kullanımdaki türevler; null süzülmez.
  kullanim: Kullanim | 'orijinal' | null;
}

// Arama adda ya da resim numarasında geçer; genel aramayla aynı Türkçe sadeleştirmeden geçer ("flans" "Flanş"ı bulur) ve
// aynı trigram ifade indeksine düşer (göç 20261029132000). Joker karakterler düz metin sayılır.
const KOSUL = `WHERE b.aktif = $1 AND ($2::text IS NULL OR b.tur = $2)
    AND ($3::text IS NULL OR public.arama_sade(b.ad) LIKE $3 OR public.arama_sade(b.resim_no) LIKE $3)
    AND ($4::boolean IS NULL OR $4 = EXISTS (SELECT 1 FROM belge_merkezi_bag g WHERE g.belge_id = b.id AND g.hedef_modul = 'istasyonlar'))
    AND ($5::text IS NULL OR ($5 = 'orijinal' AND b.kaynak_belge_id IS NULL) OR b.kullanim = $5)`;
const kosulParametreleri = (s: BelgeSuzgeci): unknown[] => [s.aktif, s.tur, s.ara === null ? null : icindeDeseni(s.ara), s.makine, s.kullanim];

export async function belgeSay(db: Db, s: BelgeSuzgeci): Promise<number> {
  const satir = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM belge_merkezi_belge b ${KOSUL}`, kosulParametreleri(s));
  return satir?.toplam ?? 0;
}

export function belgeSatirlari(db: Db, s: BelgeSuzgeci, siralama: SiralamaIstegi<BelgeSiralamasi>, dilim: Dilim): Promise<BelgeListeSatiri[]> {
  return db.sorgu<BelgeListeSatiri>(
    `SELECT b.id, b.ad, b.tur, b.aktif, b.surum, ${zamanMetni('b.guncellendi')} AS guncellendi,
            y.sira AS "yayindakiSira", s.sira AS "sonSira", s.dosya_turu AS "dosyaTuru",
            (SELECT count(*)::int FROM belge_merkezi_bag g WHERE g.belge_id = b.id) AS "bagSayisi",
            b.kullanim, b.kaynak_belge_id AS "kaynakBelgeId", k.ad AS "kaynakAd", kr.sira AS "kaynakSira", kr.durum AS "kaynakDurumu",
            (SELECT count(*)::int FROM belge_merkezi_belge t WHERE t.kaynak_belge_id = b.id) AS "turevSayisi"
       FROM belge_merkezi_belge b
       JOIN LATERAL (SELECT r.sira, r.dosya_turu FROM belge_merkezi_revizyon r WHERE r.belge_id = b.id ORDER BY r.sira DESC LIMIT 1) s ON true
       LEFT JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
       LEFT JOIN belge_merkezi_belge k ON k.id = b.kaynak_belge_id
       LEFT JOIN belge_merkezi_revizyon kr ON kr.id = b.kaynak_revizyon_id
     ${KOSUL}
      ORDER BY ${siralamaSql(SIRALAMA, siralama)}, ${GRUP_ICI} LIMIT $6 OFFSET $7`,
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
): Promise<(YayindakiBelgeSatiri & { hedefId: number; kapak: boolean })[]> {
  return db.sorgu<YayindakiBelgeSatiri & { hedefId: number; kapak: boolean }>(
    `SELECT g.hedef_id AS "hedefId", g.kapak, b.id, b.ad, b.tur, y.id AS "yayindakiRevizyonId", y.sira AS "yayindakiSira", y.dosya_turu AS "dosyaTuru", y.ozet
       FROM belge_merkezi_bag g
       JOIN belge_merkezi_belge b ON b.id = g.belge_id AND b.aktif
       JOIN belge_merkezi_revizyon y ON y.belge_id = b.id AND y.durum = 'yayinda'
      WHERE g.hedef_modul = $1 AND y.dosya_turu = ANY($2::text[])
      ORDER BY g.hedef_id, b.ad, b.id`,
    [hedefModul, [...dosyaTurleri]],
  );
}

export interface TaslakBelgeSatiri {
  hedefId: number;
  id: number;
  ad: string;
  tur: BelgeTuru;
  taslakRevizyonId: number;
  taslakSira: number;
  dosyaTuru: DosyaTuru;
}

// Kayıtlara bağlı, hiç yayında revizyonu olmayan etkin belgelerin son taslağı (3028 b: taslak model 3D Atölyesi'nde görünür).
export function bagliTaslakBelgeler(db: Db, hedefModul: BagModulu, dosyaTurleri: readonly DosyaTuru[]): Promise<TaslakBelgeSatiri[]> {
  return db.sorgu<TaslakBelgeSatiri>(
    `SELECT g.hedef_id AS "hedefId", b.id, b.ad, b.tur, y.id AS "taslakRevizyonId", y.sira AS "taslakSira", y.dosya_turu AS "dosyaTuru"
       FROM belge_merkezi_bag g
       JOIN belge_merkezi_belge b ON b.id = g.belge_id AND b.aktif
       JOIN LATERAL (
         SELECT r.id, r.sira, r.dosya_turu FROM belge_merkezi_revizyon r
          WHERE r.belge_id = b.id AND r.durum = 'taslak' ORDER BY r.sira DESC LIMIT 1
       ) y ON true
      WHERE g.hedef_modul = $1 AND y.dosya_turu = ANY($2::text[])
        AND NOT EXISTS (SELECT 1 FROM belge_merkezi_revizyon x WHERE x.belge_id = b.id AND x.durum = 'yayinda')
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
       JOIN belge_merkezi_revizyon r ON r.belge_id = b.id AND (r.durum <> 'taslak' OR b.tur = '3b-model')
      WHERE g.hedef_modul = $1 AND g.hedef_id = ANY($2::int[])
      ORDER BY g.hedef_id, b.id, r.sira`,
    [hedefModul, [...hedefIdler]],
  );
}

// Küçük resim karesi: revizyon yayına girmiş (3B modelde taslak da, 1990 a), belgesi etkin ve bir kayda bağlıysa okunur.
// Öbür türlerde taslağın karesi verilmez.
export function kucukResimKaresi(db: Db, revizyonId: number, kare: number): Promise<{ belgeId: number; ozet: string } | null> {
  return db.tek<{ belgeId: number; ozet: string }>(
    `SELECT r.belge_id AS "belgeId", o.ozet
       FROM belge_merkezi_onizleme o
       JOIN belge_merkezi_revizyon r ON r.id = o.revizyon_id
       JOIN belge_merkezi_belge b ON b.id = r.belge_id AND b.aktif AND (r.durum <> 'taslak' OR b.tur = '3b-model')
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
      WHERE b.aktif AND b.resim_no IS NOT NULL AND upper(b.resim_no) = upper($1) AND b.tur <> 'irsaliye'
        AND NOT EXISTS (SELECT 1 FROM belge_merkezi_bag g WHERE g.belge_id = b.id AND g.hedef_modul = $2 AND g.hedef_id = $3)
      ORDER BY b.ad, b.id LIMIT 20`,
    [resimNo.trim(), hedefModul, hedefId],
  );
}

// 2138-2: revizyon kodunun kaynakları. Belgelerin bütün revizyonlarının antet revizyonu ve bağlı malzeme kartları.
export function antetRevizyonlari(db: Db, belgeIdler: readonly number[]): Promise<{ belgeId: number; sira: number; ozet: string; antetRev: string | null }[]> {
  return db.sorgu(
    `SELECT r.belge_id AS "belgeId", r.sira, r.ozet, r.antet_rev AS "antetRev" FROM belge_merkezi_revizyon r WHERE r.belge_id = ANY($1::int[])`,
    [belgeIdler],
  );
}

export function malzemeBaglari(db: Db, belgeIdler: readonly number[]): Promise<{ belgeId: number; malzemeNo: number }[]> {
  return db.sorgu(
    `SELECT g.belge_id AS "belgeId", g.hedef_id AS "malzemeNo" FROM belge_merkezi_bag g
      WHERE g.belge_id = ANY($1::int[]) AND g.hedef_modul = 'malzemeler'`,
    [belgeIdler],
  );
}

// 3468-1: özeti verilen dosyanın revizyon olduğu belgeler (aynı dosya uyarısı). En çok 20 satır; arşivdekiler sonda.
export interface OzetliRevizyon {
  belgeId: number;
  ad: string;
  resimNo: string | null;
  aktif: boolean;
  sira: number;
  antetRev: string | null;
  durum: RevizyonDurumu;
}

export function ozetliRevizyonlar(db: Db, ozet: string): Promise<OzetliRevizyon[]> {
  return db.sorgu<OzetliRevizyon>(
    `SELECT b.id AS "belgeId", b.ad, b.resim_no AS "resimNo", b.aktif, r.sira, r.antet_rev AS "antetRev", r.durum
       FROM belge_merkezi_revizyon r JOIN belge_merkezi_belge b ON b.id = r.belge_id
      WHERE r.ozet = $1
      ORDER BY b.aktif DESC, b.id, r.sira LIMIT 20`,
    [ozet],
  );
}

// 3755: emre sabitlenecek parça revizyonu seçeneği; yalnız yayına girmiş (yayında ya da eski) revizyonlar.
export interface CizimRevizyonuSatiri { belgeId: number; ad: string; revizyonId: number; sira: number; durum: 'yayinda' | 'eski'; antetRev: string | null; yayinlandi: string }
export function yayinlanmisRevizyonlar(db: Db, belgeIdler: readonly number[]): Promise<CizimRevizyonuSatiri[]> {
  return db.sorgu<CizimRevizyonuSatiri>(
    `SELECT r.belge_id AS "belgeId", b.ad, r.id AS "revizyonId", r.sira, r.durum, r.antet_rev AS "antetRev", ${zamanMetni('r.yayinlandi')} AS yayinlandi
       FROM belge_merkezi_revizyon r JOIN belge_merkezi_belge b ON b.id = r.belge_id
      WHERE r.belge_id = ANY($1::int[]) AND r.durum <> 'taslak'
      ORDER BY r.belge_id, r.sira DESC`,
    [[...belgeIdler]],
  );
}
