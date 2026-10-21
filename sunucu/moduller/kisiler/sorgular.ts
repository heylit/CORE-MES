import type { Db } from '#cekirdek/db.ts';
import type { KisiAlanlari } from './kurallar.ts';

export interface GirisKaydi {
  id: number;
  parola_ozeti: string;
  pin_ozeti: string | null;
  pin_belirlenecek: boolean;
  bayrakli: boolean;
}

// FOR SHARE: süren bir parola ya da PIN değişimi ya da pasife alma commit olana dek giriş bekler ve sonra yeni özeti / pasifliği görür.
// Giriş aynı transaction'da oturumu yazar; kilit commit'e kadar tutulur, değişim de o girişin commit'ini bekler.
export function girisKaydiBul(db: Db, kullaniciAdi: string): Promise<GirisKaydi | null> {
  return db.tek<GirisKaydi>(
    `SELECT k.id, k.parola_ozeti, k.pin_ozeti, k.pin_belirlenecek,
            EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = k.id AND r.yonetici) AS bayrakli
       FROM kisi k
      WHERE k.kullanici_adi = $1 AND k.aktif AND k.parola_ozeti IS NOT NULL
        FOR SHARE OF k`,
    [kullaniciAdi],
  );
}

export interface YetkiKaydi {
  id: number;
  ad: string;
  butun_islemler: boolean;
  islemler: unknown[];
  acilis_sayfasi: string | null;
}

// Oturumun açılışı kişinin "bundan önceki oturumlar geçersiz" zamanından eskiyse kişi yüklenmez. Koşul yalnız oturum
// verildiğinde eklenir: giriş (oturum henüz yok) bu sütunu hiç okumaz.
const GECERSIZ_ONCE_SARTI = ' AND (k.oturumlar_gecersiz_once IS NULL OR $2::timestamptz > k.oturumlar_gecersiz_once)';

// Pasif kişi ve giriş bilgisi olmayan kişi kullanıcı değildir.
export function yetkiKaydiBul(db: Db, kisiId: number, oturumAcildi: string | null = null): Promise<YetkiKaydi | null> {
  return db.tek<YetkiKaydi>(
    `SELECT k.id, k.ad,
            EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id
                     WHERE kr.kisi_id = k.id AND r.yonetici) AS butun_islemler,
            -- Rollerin işlemleri ve kişiye verilen ek işlemler (kart #1233) birleşir.
            COALESCE((SELECT jsonb_agg(DISTINCT t.islem) FROM (
                        SELECT ri.islem FROM kisi_rolu kr JOIN rol_islemi ri ON ri.rol_id = kr.rol_id WHERE kr.kisi_id = k.id
                        UNION ALL
                        SELECT ki.islem FROM kisi_islemi ki WHERE ki.kisi_id = k.id) t), '[]'::jsonb) AS islemler,
            -- Açılış sayfası yalnız kişinin bütün rolleri aynı sayfayı söylüyorsa geçerlidir; boş ya da farklı olan ana sayfada bırakır.
            (SELECT CASE WHEN bool_and(r.acilis_sayfasi IS NOT NULL) AND count(DISTINCT r.acilis_sayfasi) = 1
                         THEN min(r.acilis_sayfasi) END
               FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id
              WHERE kr.kisi_id = k.id) AS acilis_sayfasi
       FROM kisi k
      WHERE k.id = $1 AND k.aktif AND k.kullanici_adi IS NOT NULL${oturumAcildi === null ? '' : GECERSIZ_ONCE_SARTI}`,
    oturumAcildi === null ? [kisiId] : [kisiId, oturumAcildi],
  );
}

export interface RolSatiri {
  id: number;
  ad: string;
  yonetici: boolean;
}

export interface KisiSatiri {
  id: number;
  ad: string;
  aktif: boolean;
  giris_var: boolean;
  kullanici_adi: string | null;
  pin_var: boolean;
  sicil_no: string | null;
  gorev: string | null;
  roller: RolSatiri[];
  surum: number;
}

// Parola ve PIN özeti hiçbir zaman seçilmez; yalnız var olup olmadığı döner. Kullanıcı adını kime göstereceğine servis karar verir.
export function kisiSatirlari(db: Db, kisiId?: number): Promise<KisiSatiri[]> {
  return db.sorgu<KisiSatiri>(
    `SELECT k.id, k.ad, k.aktif, k.kullanici_adi IS NOT NULL AS giris_var, k.kullanici_adi, k.pin_ozeti IS NOT NULL AS pin_var, k.sicil_no, k.gorev, k.surum,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'ad', r.ad, 'yonetici', r.yonetici) ORDER BY r.ad, r.id)
                        FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = k.id), '[]'::jsonb) AS roller
       FROM kisi k
      WHERE $1::int IS NULL OR k.id = $1
      ORDER BY k.ad, k.id`,
    [kisiId ?? null],
  );
}

// Pasif kişi sayılmaz: kaydı tamamlanmayan ama çalışmayan kişi iş değildir.
export async function eksikBilgiSayilari(db: Db): Promise<{ eksik: number; sicilsiz: number; gorevsiz: number }> {
  const satir = await db.tek<{ eksik: number; sicilsiz: number; gorevsiz: number }>(
    `SELECT count(*) FILTER (WHERE k.sicil_no IS NULL OR k.gorev IS NULL)::int AS eksik,
            count(*) FILTER (WHERE k.sicil_no IS NULL)::int AS sicilsiz,
            count(*) FILTER (WHERE k.gorev IS NULL)::int AS gorevsiz
       FROM kisi k
      WHERE k.aktif`,
  );
  if (satir === null) throw new Error('Toplama sorgusu satır döndürmedi.');
  return satir;
}

// Komutun ilk yazmasıdır: kişi satırını kilitler (aynı kişiye gelen ikinci komut bekler) ve sürümü artırır. Beklenen sürüm
// verilirse yalnız o sürümde yazar; satır dönmezse kayıt yok ya da sürüm eskidir (ayrımı `kisiVarMi`).
export async function surumuIlerlet(db: Db, kisiId: number, beklenen: number | null): Promise<boolean> {
  const satir = await db.tek(
    'UPDATE kisi SET surum = surum + 1 WHERE id = $1 AND ($2::int IS NULL OR surum = $2) RETURNING id',
    [kisiId, beklenen],
  );
  return satir !== null;
}

export function rolSatirlari(db: Db): Promise<RolSatiri[]> {
  return db.sorgu<RolSatiri>('SELECT id, ad, yonetici FROM rol ORDER BY ad, id');
}

export interface RolIslemSatiri extends RolSatiri {
  islemler: unknown[];
}

export function rolIslemSatirlari(db: Db): Promise<RolIslemSatiri[]> {
  return db.sorgu<RolIslemSatiri>(
    `SELECT r.id, r.ad, r.yonetici,
            COALESCE(jsonb_agg(ri.islem) FILTER (WHERE ri.islem IS NOT NULL), '[]'::jsonb) AS islemler
       FROM rol r LEFT JOIN rol_islemi ri ON ri.rol_id = r.id
      GROUP BY r.id
      ORDER BY r.ad, r.id`,
  );
}

export function rolBul(db: Db, rolId: number): Promise<RolSatiri | null> {
  return db.tek<RolSatiri>('SELECT id, ad, yonetici FROM rol WHERE id = $1', [rolId]);
}

export async function kullaniciAdindanKisiNo(db: Db, kullaniciAdi: string): Promise<number | null> {
  return (await db.tek<{ id: number }>('SELECT id FROM kisi WHERE kullanici_adi = $1', [kullaniciAdi]))?.id ?? null;
}

export async function kisiGorevBul(db: Db, kisiId: number): Promise<string | null> {
  return (await db.tek<{ gorev: string | null }>('SELECT gorev FROM kisi WHERE id = $1', [kisiId]))?.gorev ?? null;
}

export function kisiGorevleriniBul(db: Db, idler: readonly number[]): Promise<{ id: number; gorev: string | null }[]> {
  return db.sorgu<{ id: number; gorev: string | null }>('SELECT id, gorev FROM kisi WHERE id = ANY($1::int[])', [idler]);
}

export async function rolNoKodundan(db: Db, kod: string): Promise<number | null> {
  return (await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))?.id ?? null;
}

export async function onekliKullaniciVarMi(db: Db, onek: string): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM kisi WHERE starts_with(kullanici_adi, $1) LIMIT 1', [onek])) !== null;
}

// Kullanıcı: aktif ve girişi olan kişi (yetkiKaydiBul ile aynı koşul).
export async function kisiKullaniciMi(db: Db, kisiId: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM kisi WHERE id = $1 AND aktif AND kullanici_adi IS NOT NULL', [kisiId])) !== null;
}

export async function kisiVarMi(db: Db, kisiId: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM kisi WHERE id = $1', [kisiId])) !== null;
}

export async function kisiBayrakliMi(db: Db, kisiId: number): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = $1 AND r.yonetici) AS var',
    [kisiId],
  );
  return satir?.var === true;
}

export async function rolVarMi(db: Db, kisiId: number, rolId: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM kisi_rolu WHERE kisi_id = $1 AND rol_id = $2', [kisiId, rolId])) !== null;
}

// Bayraklı rollerin satırları tutarlı sırayla kilitlenir: bayraklı rol alan iki komut sıraya girer, ikincisi
// birincinin sonucunu görür. Rol ataması (FOR KEY SHARE) bu kilitle çakışmaz.
export async function bayrakliRolleriKilitle(db: Db): Promise<void> {
  await db.sorgu('SELECT id FROM rol WHERE yonetici ORDER BY id FOR NO KEY UPDATE');
}

// Verilen (kişi, rol) bağı olmasaydı bayraklı rolü olan, girişi olan ve aktif kaç kişi kalırdı.
export async function bayrakliKalanSayisi(db: Db, kisiId: number, rolId: number): Promise<number> {
  const satir = await db.tek<{ sayi: number }>(
    `SELECT count(*)::int AS sayi
       FROM kisi k
      WHERE k.aktif AND k.kullanici_adi IS NOT NULL
        AND EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id
                     WHERE kr.kisi_id = k.id AND r.yonetici AND NOT (kr.kisi_id = $1 AND kr.rol_id = $2))`,
    [kisiId, rolId],
  );
  return satir?.sayi ?? 0;
}

export async function rolEkle(db: Db, kisiId: number, rolId: number): Promise<boolean> {
  const satir = await db.tek(
    'INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING kisi_id',
    [kisiId, rolId],
  );
  return satir !== null;
}

// Silinen satır yoksa false: bağ kilit beklenirken başkası tarafından alınmıştır.
export async function rolSil(db: Db, kisiId: number, rolId: number): Promise<boolean> {
  const satir = await db.tek('DELETE FROM kisi_rolu WHERE kisi_id = $1 AND rol_id = $2 RETURNING kisi_id', [kisiId, rolId]);
  return satir !== null;
}

// "Girişi olan kişinin en az bir rolü" kuralı transaction sonunda denetlenir; burada hemen denetletilir ki
// ihlal bu komutun hatası olsun (aksi halde commit anında, iletisiz görünür).
export async function rolKuraliniHemenDenetle(db: Db): Promise<void> {
  await db.sorgu('SET CONSTRAINTS kisi_rolu_giris_rol_ister IMMEDIATE');
}

// Kişi ve rolü tek deyimde yazılır: rolsüz giriş hesabı hiçbir anda kalıcı olamaz.
export async function yoneticiEkle(db: Db, kisi: { ad: string; kullaniciAdi: string; parolaOzeti: string }): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `WITH hedef AS (SELECT id FROM rol WHERE kod = 'yonetici'),
          yeni AS (INSERT INTO kisi (ad, kullanici_adi, parola_ozeti) SELECT $1, $2, $3 FROM hedef RETURNING id),
          bag AS (INSERT INTO kisi_rolu (kisi_id, rol_id) SELECT yeni.id, hedef.id FROM yeni, hedef)
     SELECT id FROM yeni`,
    [kisi.ad, kisi.kullaniciAdi, kisi.parolaOzeti],
  );
  if (!satir) throw new Error('Yerleşik yönetici rolü bulunamadı (göçler uygulanmış mı?).');
  return satir.id;
}

export async function kisiYaz(db: Db, alanlar: KisiAlanlari): Promise<number> {
  const satir = await db.tek<{ id: number }>('INSERT INTO kisi (ad, sicil_no, gorev) VALUES ($1, $2, $3) RETURNING id', [
    alanlar.ad, alanlar.sicilNo, alanlar.gorev,
  ]);
  if (!satir) throw new Error('Kişi eklenemedi.');
  return satir.id;
}

export async function kisiGuncelle(db: Db, kisiId: number, alanlar: KisiAlanlari): Promise<boolean> {
  const satir = await db.tek('UPDATE kisi SET ad = $2, sicil_no = $3, gorev = $4 WHERE id = $1 RETURNING id', [
    kisiId, alanlar.ad, alanlar.sicilNo, alanlar.gorev,
  ]);
  return satir !== null;
}

// Durum zaten istenen değerdeyse false: aynı anda gelen ikinci komut ilkinin sonucunu görür.
export async function aktifYaz(db: Db, kisiId: number, aktif: boolean): Promise<boolean> {
  const satir = await db.tek('UPDATE kisi SET aktif = $2 WHERE id = $1 AND aktif <> $2 RETURNING id', [kisiId, aktif]);
  return satir !== null;
}

// Verilen kişi dışında bayraklı rolü olan, girişi olan ve aktif kaç kişi var.
export async function bayrakliSayisiHaric(db: Db, haricKisiId: number): Promise<number> {
  const satir = await db.tek<{ sayi: number }>(
    `SELECT count(*)::int AS sayi
       FROM kisi k
      WHERE k.id <> $1 AND k.aktif AND k.kullanici_adi IS NOT NULL
        AND EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = k.id AND r.yonetici)`,
    [haricKisiId],
  );
  return satir?.sayi ?? 0;
}

// Giriş bilgisi yalnız hiç yoksa yazılır: aynı kişiye aynı anda iki hesap açılamaz.
export async function hesapYaz(db: Db, kisiId: number, kullaniciAdi: string, parolaOzeti: string): Promise<boolean> {
  const satir = await db.tek(
    'UPDATE kisi SET kullanici_adi = $2, parola_ozeti = $3 WHERE id = $1 AND kullanici_adi IS NULL RETURNING id',
    [kisiId, kullaniciAdi, parolaOzeti],
  );
  return satir !== null;
}

export interface GirisBilgisi {
  kullanici_adi: string;
  parola_ozeti: string;
}

export function girisBilgisiBul(db: Db, kisiId: number): Promise<GirisBilgisi | null> {
  return db.tek<GirisBilgisi>(
    'SELECT kullanici_adi, parola_ozeti FROM kisi WHERE id = $1 AND kullanici_adi IS NOT NULL AND parola_ozeti IS NOT NULL',
    [kisiId],
  );
}

export interface PinBilgisi {
  pin_ozeti: string | null;
  parola_ozeti: string | null;
}

// Kendi PIN'ini değiştirme: giriş hesabı olan kişinin PIN ve parola özetleri.
export function pinBilgisiBul(db: Db, kisiId: number): Promise<PinBilgisi | null> {
  return db.tek<PinBilgisi>('SELECT pin_ozeti, parola_ozeti FROM kisi WHERE id = $1 AND kullanici_adi IS NOT NULL', [kisiId]);
}

export async function parolaYaz(db: Db, kisiId: number, parolaOzeti: string): Promise<boolean> {
  const satir = await db.tek('UPDATE kisi SET parola_ozeti = $2 WHERE id = $1 AND kullanici_adi IS NOT NULL RETURNING id', [kisiId, parolaOzeti]);
  return satir !== null;
}

export async function pinYaz(db: Db, kisiId: number, pinOzeti: string, belirlenecek: boolean): Promise<boolean> {
  const satir = await db.tek(
    'UPDATE kisi SET pin_ozeti = $2, pin_belirlenecek = $3 WHERE id = $1 AND kullanici_adi IS NOT NULL RETURNING id',
    [kisiId, pinOzeti, belirlenecek],
  );
  return satir !== null;
}

// Kişinin o ana kadar açılmış bütün oturumları geçersiz olur (kapatılmaz; kimlik çözümü zamanı karşılaştırır).
// clock_timestamp: transaction başlangıcı değil, satır kilitlendikten sonraki an; yoksa değişimden önce başlamış bir girişin
// oturumu (açılışı daha sonra) geçersiz sayılmaz.
export async function oturumlariGecersizKil(db: Db, kisiId: number): Promise<void> {
  await db.sorgu('UPDATE kisi SET oturumlar_gecersiz_once = clock_timestamp() WHERE id = $1', [kisiId]);
}

// Pasif kişi de döner: tarihçe kayıtlarında adı gerekir. Olmayan kimlik sonuçta yoktur.
export function kisiAdlariniBul(db: Db, idler: readonly number[]): Promise<{ id: number; ad: string }[]> {
  return db.sorgu<{ id: number; ad: string }>('SELECT id, ad FROM kisi WHERE id = ANY($1::int[])', [idler]);
}

export interface KisiIslemSatiri {
  id: number;
  butun_islemler: boolean;
  islemler: unknown[];
}

// yetkiKaydiBul ile aynı kapsam (aktif ve girişli kişi), bütün kişiler için tek sorguda.
export function kisiIslemSatirlari(db: Db): Promise<KisiIslemSatiri[]> {
  return db.sorgu<KisiIslemSatiri>(
    `SELECT k.id,
            EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = k.id AND r.yonetici) AS butun_islemler,
            COALESCE((SELECT jsonb_agg(DISTINCT t.islem) FROM (
                        SELECT ri.islem FROM kisi_rolu kr JOIN rol_islemi ri ON ri.rol_id = kr.rol_id WHERE kr.kisi_id = k.id
                        UNION ALL
                        SELECT ki.islem FROM kisi_islemi ki WHERE ki.kisi_id = k.id) t), '[]'::jsonb) AS islemler
       FROM kisi k
      WHERE k.aktif AND k.kullanici_adi IS NOT NULL`,
  );
}

export interface KisiRolIslemSatiri {
  id: number;
  butun_islemler: boolean;
  islemler: unknown[];
}

// kisiIslemSatirlari ile aynı kapsam, yalnız rolden gelen işlemler (kişiye verilen ek işlemler dışarıda). Kişi verilirse yalnız o kişi.
export function kisiRolIslemSatirlari(db: Db, kisiId?: number): Promise<KisiRolIslemSatiri[]> {
  return db.sorgu<KisiRolIslemSatiri>(
    `SELECT k.id,
            EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = k.id AND r.yonetici) AS butun_islemler,
            COALESCE((SELECT jsonb_agg(DISTINCT ri.islem) FROM kisi_rolu kr JOIN rol_islemi ri ON ri.rol_id = kr.rol_id
                       WHERE kr.kisi_id = k.id), '[]'::jsonb) AS islemler
       FROM kisi k
      WHERE k.aktif AND k.kullanici_adi IS NOT NULL AND ($1::int IS NULL OR k.id = $1)`,
    [kisiId ?? null],
  );
}

export interface KisiEkIslemSatiri {
  id: number;
  ad: string;
  kullanici_adi: string;
  bayrakli: boolean;
  rol_islemleri: unknown[];
  ek_islemler: unknown[];
}

// Ek işlem ekranı (kart #1233): yalnız kullanıcılar (aktif ve girişli); rolden gelen ve kişiye verilen işlemler ayrı.
export function kisiEkIslemSatirlari(db: Db): Promise<KisiEkIslemSatiri[]> {
  return db.sorgu<KisiEkIslemSatiri>(
    `SELECT k.id, k.ad, k.kullanici_adi,
            EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = k.id AND r.yonetici) AS bayrakli,
            COALESCE((SELECT jsonb_agg(DISTINCT ri.islem) FROM kisi_rolu kr JOIN rol_islemi ri ON ri.rol_id = kr.rol_id
                       WHERE kr.kisi_id = k.id), '[]'::jsonb) AS rol_islemleri,
            COALESCE((SELECT jsonb_agg(ki.islem ORDER BY ki.islem) FROM kisi_islemi ki WHERE ki.kisi_id = k.id), '[]'::jsonb) AS ek_islemler
       FROM kisi k
      WHERE k.aktif AND k.kullanici_adi IS NOT NULL
      ORDER BY k.ad, k.id`,
  );
}

// Kişiye ek işlem (kart #1233): komut hedef durumu söyler; satır varsa ekleme, yoksa silme sessizce geçer. Veren ve zaman ilk verilişindir.
export async function kisiIslemiEkle(db: Db, kisiId: number, islem: string, verenId: number): Promise<void> {
  await db.sorgu('INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [kisiId, islem, verenId]);
}

export async function kisiIslemiSil(db: Db, kisiId: number, islem: string): Promise<void> {
  await db.sorgu('DELETE FROM kisi_islemi WHERE kisi_id = $1 AND islem = $2', [kisiId, islem]);
}

// Ekrandan yetki düzenleme (kart #684): satır varsa ekleme, yoksa silme sessizce geçer; komut hedef durumu söyler.
export async function rolIslemiEkle(db: Db, rolId: number, islem: string): Promise<void> {
  await db.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rolId, islem]);
}

export async function rolIslemiSil(db: Db, rolId: number, islem: string): Promise<void> {
  await db.sorgu('DELETE FROM rol_islemi WHERE rol_id = $1 AND islem = $2', [rolId, islem]);
}

// Etkin kişilerin seçim listesi (başka modüllerin kişi seçme alanı için): kimlik, ad, sicil no.
export function etkinKisiSecenekleri(db: Db): Promise<{ id: number; ad: string; sicilNo: string | null }[]> {
  return db.sorgu('SELECT id, ad, sicil_no AS "sicilNo" FROM kisi WHERE aktif ORDER BY ad, id');
}

export function rolKodSatirlari(db: Db): Promise<{ id: number; kod: string; ad: string }[]> {
  return db.sorgu('SELECT id, kod, ad FROM rol ORDER BY ad, id');
}

// Rollerden birini taşıyan etkin ve girişli kişiler; bildirim alıcısı olabilecek kapsam kisiIslemSatirlari ile aynıdır.
export async function rollerdekiKisiSatirlari(db: Db, rolIdleri: readonly number[]): Promise<number[]> {
  const satirlar = await db.sorgu<{ id: number }>(
    `SELECT DISTINCT k.id FROM kisi k JOIN kisi_rolu kr ON kr.kisi_id = k.id
      WHERE kr.rol_id = ANY($1::int[]) AND k.aktif AND k.kullanici_adi IS NOT NULL ORDER BY k.id`,
    [rolIdleri],
  );
  return satirlar.map((s) => s.id);
}
