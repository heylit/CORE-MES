import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/tesis-zamani.ts';
import type { GeriBildirimDurumu, GeriBildirimKonusu, GeriBildirimTuru, TemaTercihi } from '#paylasilan/sozlesme/profil.ts';

export interface GeriBildirimSatiri {
  id: number;
  kisiId: number;
  konu: GeriBildirimKonusu;
  tur: GeriBildirimTuru;
  metin: string;
  gonderildi: string;
}

const SECIM = `id, kisi_id AS "kisiId", konu, tur, metin, ${zamanMetni('gonderildi')} AS gonderildi`;

export async function geriBildirimEkle(db: Db, kisiId: number, g: { konu: GeriBildirimKonusu; tur: GeriBildirimTuru; metin: string }): Promise<GeriBildirimSatiri> {
  const r = await db.tek<GeriBildirimSatiri>(
    `INSERT INTO profil_geri_bildirim (kisi_id, konu, tur, metin) VALUES ($1, $2, $3, $4) RETURNING ${SECIM}`,
    [kisiId, g.konu, g.tur, g.metin],
  );
  if (r === null) throw new Error('Geri bildirim yazılamadı.');
  return r;
}

export function kisininGeriBildirimleri(db: Db, kisiId: number, sinir: number): Promise<GeriBildirimSatiri[]> {
  return db.sorgu<GeriBildirimSatiri>(
    `SELECT ${SECIM} FROM profil_geri_bildirim WHERE kisi_id = $1 ORDER BY gonderildi DESC, id DESC LIMIT $2`,
    [kisiId, sinir],
  );
}

// Merkezin listesi (kart 2192). Takip satırı olmayan kayıt "yeni" sayılır; kategoriId 0 kategorisiz kayıtları seçer.
// Arama yazının içinde büyük-küçük harf gözetmeden geçer; joker karakterler kaçırılır (aranan metin kalıp değildir).
export interface ListeSuzgeci {
  konu: GeriBildirimKonusu | null;
  tur: GeriBildirimTuru | null;
  durum: GeriBildirimDurumu | null;
  kategoriId: number | null;
  ara: string | null;
}

export interface MerkezSatiri extends GeriBildirimSatiri {
  durum: GeriBildirimDurumu;
  kategoriId: number | null;
  kategoriAdi: string | null;
  anaKayitId: number | null;
  hareketSayisi: number;
}

const MERKEZ_KAYNAK = `FROM profil_geri_bildirim g
  LEFT JOIN profil_geri_bildirim_takip t ON t.geri_bildirim_id = g.id
  LEFT JOIN profil_geri_bildirim_kategori k ON k.id = t.kategori_id`;
const MERKEZ_SUZGEC = `WHERE ($1::text IS NULL OR g.konu = $1) AND ($2::text IS NULL OR g.tur = $2)
  AND ($3::text IS NULL OR COALESCE(t.durum, 'yeni') = $3)
  AND ($4::int IS NULL OR ($4 = 0 AND t.kategori_id IS NULL) OR t.kategori_id = $4)
  AND ($5::text IS NULL OR g.metin ILIKE '%' || replace(replace(replace($5, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%')`;
const MERKEZ_SECIM = `g.id, g.kisi_id AS "kisiId", g.konu, g.tur, g.metin, ${zamanMetni('g.gonderildi')} AS gonderildi,
  COALESCE(t.durum, 'yeni') AS durum, t.kategori_id AS "kategoriId", k.ad AS "kategoriAdi", t.ana_kayit_id AS "anaKayitId",
  (SELECT count(*)::int FROM profil_geri_bildirim_hareket h WHERE h.geri_bildirim_id = g.id) AS "hareketSayisi"`;
const suzgecDegerleri = (s: ListeSuzgeci): unknown[] => [s.konu, s.tur, s.durum, s.kategoriId, s.ara];

export async function geriBildirimSay(db: Db, s: ListeSuzgeci): Promise<number> {
  const r = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${MERKEZ_KAYNAK} ${MERKEZ_SUZGEC}`, suzgecDegerleri(s));
  return r?.toplam ?? 0;
}

export function geriBildirimSatirlari(db: Db, s: ListeSuzgeci, dilim: Dilim): Promise<MerkezSatiri[]> {
  return db.sorgu<MerkezSatiri>(
    `SELECT ${MERKEZ_SECIM} ${MERKEZ_KAYNAK} ${MERKEZ_SUZGEC} ORDER BY g.gonderildi DESC, g.id DESC LIMIT $6 OFFSET $7`,
    [...suzgecDegerleri(s), dilim.sinir, dilim.atla],
  );
}

export function merkezSatiri(db: Db, id: number): Promise<MerkezSatiri | null> {
  return db.tek<MerkezSatiri>(`SELECT ${MERKEZ_SECIM} ${MERKEZ_KAYNAK} WHERE g.id = $1`, [id]);
}

export interface TakipSatiri {
  durum: GeriBildirimDurumu;
  kategoriId: number | null;
  sorumluKisiId: number | null;
  anaKayitId: number | null;
  surum: number;
}

const TAKIP_SECIM = 'durum, kategori_id AS "kategoriId", sorumlu_kisi_id AS "sorumluKisiId", ana_kayit_id AS "anaKayitId", surum';

// Yazmadan önce okunur: aynı kayda gelen iki yazma sırayla geçer.
export function takipKilitle(db: Db, id: number): Promise<TakipSatiri | null> {
  return db.tek<TakipSatiri>(`SELECT ${TAKIP_SECIM} FROM profil_geri_bildirim_takip WHERE geri_bildirim_id = $1 FOR UPDATE`, [id]);
}

export function takipOku(db: Db, id: number): Promise<TakipSatiri | null> {
  return db.tek<TakipSatiri>(`SELECT ${TAKIP_SECIM} FROM profil_geri_bildirim_takip WHERE geri_bildirim_id = $1`, [id]);
}

// Kaydı yazan kişi; kayıt yoksa null. Yanıt ve kapanış bildirimi yalnız ona gider.
export async function kayitYazani(db: Db, id: number): Promise<number | null> {
  return (await db.tek<{ kisiId: number }>('SELECT kisi_id AS "kisiId" FROM profil_geri_bildirim WHERE id = $1', [id]))?.kisiId ?? null;
}

export async function kayitVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek<{ id: number }>('SELECT id FROM profil_geri_bildirim WHERE id = $1', [id])) !== null;
}

export interface TakipYazimi { durum: GeriBildirimDurumu; kategoriId: number | null; sorumluKisiId: number | null; anaKayitId: number | null }

// İlk yazım: aynı anda gelen ikinci ilk yazım satır açmaz, null döner (sürüm çakışması).
export function takipEkle(db: Db, id: number, t: TakipYazimi): Promise<TakipSatiri | null> {
  return db.tek<TakipSatiri>(
    `INSERT INTO profil_geri_bildirim_takip (geri_bildirim_id, durum, kategori_id, sorumlu_kisi_id, ana_kayit_id)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (geri_bildirim_id) DO NOTHING RETURNING ${TAKIP_SECIM}`,
    [id, t.durum, t.kategoriId, t.sorumluKisiId, t.anaKayitId],
  );
}

// Okunan sürüm tutmazsa satır değişmez, null döner.
export function takipGuncelle(db: Db, id: number, t: TakipYazimi, surum: number): Promise<TakipSatiri | null> {
  return db.tek<TakipSatiri>(
    `UPDATE profil_geri_bildirim_takip SET durum = $2, kategori_id = $3, sorumlu_kisi_id = $4, ana_kayit_id = $5,
       surum = surum + 1, guncellendi = now()
     WHERE geri_bildirim_id = $1 AND surum = $6 RETURNING ${TAKIP_SECIM}`,
    [id, t.durum, t.kategoriId, t.sorumluKisiId, t.anaKayitId, surum],
  );
}

export async function bagliKayitSayisi(db: Db, id: number): Promise<number> {
  const r = await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM profil_geri_bildirim_takip WHERE ana_kayit_id = $1', [id]);
  return r?.n ?? 0;
}

export function bagliKayitlar(db: Db, id: number): Promise<{ id: number; tur: GeriBildirimTuru; metin: string; durum: GeriBildirimDurumu }[]> {
  return db.sorgu(
    `SELECT g.id, g.tur, g.metin, t.durum FROM profil_geri_bildirim_takip t JOIN profil_geri_bildirim g ON g.id = t.geri_bildirim_id
      WHERE t.ana_kayit_id = $1 ORDER BY g.gonderildi DESC, g.id DESC`,
    [id],
  );
}

export interface HareketSatiri {
  id: number;
  geriBildirimId: number;
  tur: 'yanit' | 'not' | 'durum';
  metin: string | null;
  durum: GeriBildirimDurumu | null;
  imza: string | null;
  kisiId: number;
  zaman: string;
}

const HAREKET_SECIM = `id, geri_bildirim_id AS "geriBildirimId", tur, metin, durum, imza, kisi_id AS "kisiId", ${zamanMetni('zaman')} AS zaman`;

export async function hareketEkle(
  db: Db, id: number, h: { tur: HareketSatiri['tur']; metin: string | null; durum: GeriBildirimDurumu | null; imza: string | null; kisiId: number },
): Promise<HareketSatiri> {
  const r = await db.tek<HareketSatiri>(
    `INSERT INTO profil_geri_bildirim_hareket (geri_bildirim_id, tur, metin, durum, imza, kisi_id) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${HAREKET_SECIM}`,
    [id, h.tur, h.metin, h.durum, h.imza, h.kisiId],
  );
  if (r === null) throw new Error('Geri bildirim hareketi yazılamadı.');
  return r;
}

export function hareketler(db: Db, id: number): Promise<HareketSatiri[]> {
  return db.sorgu<HareketSatiri>(`SELECT ${HAREKET_SECIM} FROM profil_geri_bildirim_hareket WHERE geri_bildirim_id = $1 ORDER BY zaman, id`, [id]);
}

// Çalışanın kendi kayıtlarının durumu ve yalnız yanıtları (not ve durum satırı girmez).
export function kendiDurumlari(db: Db, idler: readonly number[]): Promise<{ id: number; durum: GeriBildirimDurumu }[]> {
  if (idler.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT g.id, COALESCE(t.durum, 'yeni') AS durum FROM profil_geri_bildirim g
       LEFT JOIN profil_geri_bildirim_takip t ON t.geri_bildirim_id = g.id WHERE g.id = ANY($1::int[])`,
    [idler],
  );
}

export function kendiYanitlari(db: Db, idler: readonly number[]): Promise<{ geriBildirimId: number; metin: string; imza: string; zaman: string }[]> {
  if (idler.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT geri_bildirim_id AS "geriBildirimId", metin, imza, ${zamanMetni('zaman')} AS zaman FROM profil_geri_bildirim_hareket
      WHERE tur = 'yanit' AND geri_bildirim_id = ANY($1::int[]) ORDER BY zaman, id`,
    [idler],
  );
}

export interface KategoriSatiri {
  id: number;
  ad: string;
  konu: GeriBildirimKonusu | null;
  etkin: boolean;
  surum: number;
  kayitSayisi: number;
}

const KATEGORI_SECIM = `k.id, k.ad, k.konu, k.etkin, k.surum,
  (SELECT count(*)::int FROM profil_geri_bildirim_takip t WHERE t.kategori_id = k.id) AS "kayitSayisi"`;

export function kategoriler(db: Db): Promise<KategoriSatiri[]> {
  return db.sorgu<KategoriSatiri>(`SELECT ${KATEGORI_SECIM} FROM profil_geri_bildirim_kategori k ORDER BY k.etkin DESC, k.ad, k.id`);
}

export function kategori(db: Db, id: number): Promise<KategoriSatiri | null> {
  return db.tek<KategoriSatiri>(`SELECT ${KATEGORI_SECIM} FROM profil_geri_bildirim_kategori k WHERE k.id = $1`, [id]);
}

export async function kategoriAdiVarMi(db: Db, ad: string, haricId: number | null): Promise<boolean> {
  const r = await db.tek<{ id: number }>(
    'SELECT id FROM profil_geri_bildirim_kategori WHERE lower(ad) = lower($1) AND ($2::int IS NULL OR id <> $2)', [ad, haricId],
  );
  return r !== null;
}

// Aynı ad aynı anda iki kez gelirse tekil dizin ikinciyi reddeder; çağıran önce kategoriAdiVarMi ile anlaşılır hata verir.
export async function kategoriEkle(db: Db, ad: string, konu: GeriBildirimKonusu | null): Promise<number> {
  const r = await db.tek<{ id: number }>('INSERT INTO profil_geri_bildirim_kategori (ad, konu) VALUES ($1, $2) RETURNING id', [ad, konu]);
  if (r === null) throw new Error('Kategori yazılamadı.');
  return r.id;
}

export async function kategoriGuncelle(
  db: Db, id: number, k: { ad: string; konu: GeriBildirimKonusu | null; etkin: boolean }, surum: number,
): Promise<boolean> {
  const r = await db.tek<{ id: number }>(
    `UPDATE profil_geri_bildirim_kategori SET ad = $2, konu = $3, etkin = $4, surum = surum + 1 WHERE id = $1 AND surum = $5 RETURNING id`,
    [id, k.ad, k.konu, k.etkin, surum],
  );
  return r !== null;
}

// Toplam ve eğilim. Durum sayıları bütün kayıtlardan; kategori dağılımı ve aylar verilen başlangıçtan bugüne (tesis saatinde ay).
export function durumSayilari(db: Db): Promise<{ durum: GeriBildirimDurumu; n: number }[]> {
  return db.sorgu(
    `SELECT COALESCE(t.durum, 'yeni') AS durum, count(*)::int AS n FROM profil_geri_bildirim g
       LEFT JOIN profil_geri_bildirim_takip t ON t.geri_bildirim_id = g.id GROUP BY 1`,
  );
}

export function kategoriDagilimi(db: Db, baslangic: string): Promise<{
  kategoriId: number | null; ad: string | null; sikayet: number; istek: number; oneri: number; acik: number;
}[]> {
  return db.sorgu(
    `SELECT t.kategori_id AS "kategoriId", k.ad,
            count(*) FILTER (WHERE g.tur = 'sikayet')::int AS sikayet,
            count(*) FILTER (WHERE g.tur = 'istek')::int AS istek,
            count(*) FILTER (WHERE g.tur = 'oneri')::int AS oneri,
            count(*) FILTER (WHERE COALESCE(t.durum, 'yeni') IN ('yeni', 'inceleniyor', 'yanitlandi'))::int AS acik
       FROM profil_geri_bildirim g
       LEFT JOIN profil_geri_bildirim_takip t ON t.geri_bildirim_id = g.id
       LEFT JOIN profil_geri_bildirim_kategori k ON k.id = t.kategori_id
      WHERE g.gonderildi >= ($1::date)::timestamp AT TIME ZONE $2
      GROUP BY t.kategori_id, k.ad ORDER BY count(*) DESC, k.ad NULLS LAST`,
    [baslangic, TESIS_SAAT_DILIMI],
  );
}

// Ay başına gelen kayıt, o ay gelip şimdi çözülmüş ya da kapanmış kayıt ve ilk yanıta kadar geçen saatler (yanıtlanmamış girmez).
export function aylikHareket(db: Db, baslangic: string): Promise<{ ay: string; gelen: number; cozulen: number; ilkYanitSaatleri: number[] }[]> {
  return db.sorgu(
    `SELECT to_char(g.gonderildi AT TIME ZONE $2, 'YYYY-MM') AS ay,
            count(*)::int AS gelen,
            count(*) FILTER (WHERE t.durum IN ('cozuldu', 'kapandi'))::int AS cozulen,
            COALESCE(array_agg(round((extract(epoch FROM y.ilk - g.gonderildi) / 3600)::numeric, 2)::float8)
              FILTER (WHERE y.ilk IS NOT NULL), '{}') AS "ilkYanitSaatleri"
       FROM profil_geri_bildirim g
       LEFT JOIN profil_geri_bildirim_takip t ON t.geri_bildirim_id = g.id
       LEFT JOIN LATERAL (SELECT min(h.zaman) AS ilk FROM profil_geri_bildirim_hareket h
                           WHERE h.geri_bildirim_id = g.id AND h.tur = 'yanit') y ON true
      WHERE g.gonderildi >= ($1::date)::timestamp AT TIME ZONE $2
      GROUP BY 1 ORDER BY 1`,
    [baslangic, TESIS_SAAT_DILIMI],
  );
}

export interface TemaSatiri { tema: TemaTercihi; surum: number }

export function temaOku(db: Db, kisiId: number): Promise<TemaSatiri | null> {
  return db.tek<TemaSatiri>('SELECT tema, surum FROM profil_tema_tercihi WHERE kisi_id = $1', [kisiId]);
}

// İlk seçim: aynı anda gelen ikinci ilk seçim satır açmaz, null döner (sürüm çakışması).
export function temaEkle(db: Db, kisiId: number, tema: TemaTercihi): Promise<TemaSatiri | null> {
  return db.tek<TemaSatiri>(
    'INSERT INTO profil_tema_tercihi (kisi_id, tema) VALUES ($1, $2) ON CONFLICT (kisi_id) DO NOTHING RETURNING tema, surum',
    [kisiId, tema],
  );
}

// Okunan sürüm tutmazsa satır değişmez, null döner.
export function temaGuncelle(db: Db, kisiId: number, tema: TemaTercihi, surum: number): Promise<TemaSatiri | null> {
  return db.tek<TemaSatiri>(
    `UPDATE profil_tema_tercihi SET tema = $2, surum = surum + 1, guncellendi = now()
      WHERE kisi_id = $1 AND surum = $3 RETURNING tema, surum`,
    [kisiId, tema, surum],
  );
}

export interface MiniPanoSatiri { kapali: string[]; acilistaOner: boolean; surum: number }

export function miniPanoOku(db: Db, kisiId: number): Promise<MiniPanoSatiri | null> {
  return db.tek<MiniPanoSatiri>(
    'SELECT kapali, acilista_oner AS "acilistaOner", surum FROM profil_mini_pano_tercihi WHERE kisi_id = $1',
    [kisiId],
  );
}

// İlk seçim: aynı anda gelen ikinci ilk seçim satır açmaz, null döner (sürüm çakışması).
export function miniPanoEkle(db: Db, kisiId: number, kapali: readonly string[], acilistaOner: boolean): Promise<MiniPanoSatiri | null> {
  return db.tek<MiniPanoSatiri>(
    `INSERT INTO profil_mini_pano_tercihi (kisi_id, kapali, acilista_oner) VALUES ($1, $2, $3) ON CONFLICT (kisi_id) DO NOTHING
      RETURNING kapali, acilista_oner AS "acilistaOner", surum`,
    [kisiId, kapali, acilistaOner],
  );
}

// Okunan sürüm tutmazsa satır değişmez, null döner.
export function miniPanoGuncelle(db: Db, kisiId: number, kapali: readonly string[], acilistaOner: boolean, surum: number): Promise<MiniPanoSatiri | null> {
  return db.tek<MiniPanoSatiri>(
    `UPDATE profil_mini_pano_tercihi SET kapali = $2, acilista_oner = $3, surum = surum + 1, guncellendi = now()
      WHERE kisi_id = $1 AND surum = $4 RETURNING kapali, acilista_oner AS "acilistaOner", surum`,
    [kisiId, kapali, acilistaOner, surum],
  );
}

export interface MenuTercihiSatiri { sayfalar: string[]; surum: number }

export function menuTercihiOku(db: Db, kisiId: number): Promise<MenuTercihiSatiri | null> {
  return db.tek<MenuTercihiSatiri>('SELECT sayfalar, surum FROM profil_menu_tercihi WHERE kisi_id = $1', [kisiId]);
}

// İlk seçim: aynı anda gelen ikinci ilk seçim satır açmaz, null döner (sürüm çakışması).
export function menuTercihiEkle(db: Db, kisiId: number, sayfalar: readonly string[]): Promise<MenuTercihiSatiri | null> {
  return db.tek<MenuTercihiSatiri>(
    `INSERT INTO profil_menu_tercihi (kisi_id, sayfalar) VALUES ($1, $2) ON CONFLICT (kisi_id) DO NOTHING
      RETURNING sayfalar, surum`,
    [kisiId, sayfalar],
  );
}

// Okunan sürüm tutmazsa satır değişmez, null döner.
export function menuTercihiGuncelle(db: Db, kisiId: number, sayfalar: readonly string[], surum: number): Promise<MenuTercihiSatiri | null> {
  return db.tek<MenuTercihiSatiri>(
    `UPDATE profil_menu_tercihi SET sayfalar = $2, surum = surum + 1, guncellendi = now()
      WHERE kisi_id = $1 AND surum = $3 RETURNING sayfalar, surum`,
    [kisiId, sayfalar, surum],
  );
}
