import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { BosKart, KartTuru, KimlikTuru, Neden, ZiyaretDurumu } from '#paylasilan/sozlesme/nizamiye.ts';

// Ad alanları kişiler modülünden servis doldurur; burada yalnız kimlikler okunur.
export interface ZiyaretSatiri {
  id: number;
  ziyaretNo: string;
  ad: string | null;
  firmaAdi: string | null;
  telefon: string | null;
  neden: Neden;
  aciklama: string | null;
  plaka: string | null;
  evSahibiKisiId: number;
  beklenenZaman: string | null;
  ogleYemegi: boolean;
  kimlikGoruldu: boolean;
  kimlikTuru: KimlikTuru | null;
  kimlikSon4: string | null;
  atolye: boolean;
  dizustu: boolean;
  kvkkOnayi: boolean;
  ekipmanKontrol: boolean | null;
  kartId: number | null;
  kartNo: string | null;
  kartTeslim: boolean | null;
  durum: ZiyaretDurumu;
  giris: string | null;
  girenKisiId: number | null;
  cikis: string | null;
  cikaranKisiId: number | null;
  iptalZaman: string | null;
  olusturma: string;
  surum: number;
}

const ZIYARET_SUTUNLARI = `z.id, z.ziyaret_no AS "ziyaretNo", z.ad, z.firma_adi AS "firmaAdi", z.telefon, z.neden, z.aciklama, z.plaka,
  z.ev_sahibi_kisi_id AS "evSahibiKisiId", ${zamanMetni('z.beklenen_zaman')} AS "beklenenZaman", z.ogle_yemegi AS "ogleYemegi",
  z.kimlik_goruldu AS "kimlikGoruldu", z.kimlik_turu AS "kimlikTuru", z.kimlik_son4 AS "kimlikSon4", z.atolye, z.dizustu,
  z.kvkk_onayi AS "kvkkOnayi", z.ekipman_kontrol AS "ekipmanKontrol", z.kart_id AS "kartId", k.kart_no AS "kartNo",
  z.kart_teslim AS "kartTeslim", z.durum, ${zamanMetni('z.giris')} AS giris, z.giren_kisi_id AS "girenKisiId",
  ${zamanMetni('z.cikis')} AS cikis, z.cikaran_kisi_id AS "cikaranKisiId", ${zamanMetni('z.iptal_zaman')} AS "iptalZaman",
  ${zamanMetni('z.olusturma')} AS olusturma, z.surum`;
const ZIYARET_KAYNAGI = 'nizamiye_ziyaret z LEFT JOIN nizamiye_kart k ON k.id = z.kart_id';

export async function simdi(db: Db): Promise<string> {
  return (await db.tek<{ simdi: string }>(`SELECT ${zamanMetni('now()')} AS simdi`))!.simdi;
}

export function ziyaretOku(db: Db, id: number): Promise<ZiyaretSatiri | null> {
  return db.tek<ZiyaretSatiri>(`SELECT ${ZIYARET_SUTUNLARI} FROM ${ZIYARET_KAYNAGI} WHERE z.id = $1`, [id]);
}

// Komut satırı kilitler; eşzamanlı iki görevli aynı ziyareti iki kez içeri alamaz ya da çıkaramaz.
export function ziyaretKilitle(db: Db, id: number): Promise<ZiyaretSatiri | null> {
  return db.tek<ZiyaretSatiri>(`SELECT ${ZIYARET_SUTUNLARI} FROM ${ZIYARET_KAYNAGI} WHERE z.id = $1 FOR UPDATE OF z`, [id]);
}

export async function ziyaretNoVarMi(db: Db, no: string): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM nizamiye_ziyaret WHERE ziyaret_no = $1', [no])) !== null;
}

// Beklenenler: bugüne ya da önceki günlere düşen (geciken) ön kayıtlar; yarın ve sonrası kapı listesine girmez.
export function beklenenleriOku(db: Db): Promise<ZiyaretSatiri[]> {
  return db.sorgu<ZiyaretSatiri>(
    `SELECT ${ZIYARET_SUTUNLARI} FROM ${ZIYARET_KAYNAGI}
      WHERE z.durum = 'beklenen' AND z.beklenen_zaman < (now()::date + 1)::timestamptz
      ORDER BY z.beklenen_zaman, z.id`,
  );
}

export function icerdekileriOku(db: Db): Promise<ZiyaretSatiri[]> {
  return db.sorgu<ZiyaretSatiri>(`SELECT ${ZIYARET_SUTUNLARI} FROM ${ZIYARET_KAYNAGI} WHERE z.durum = 'iceride' ORDER BY z.giris, z.id`);
}

// Günün kayıtları: o gün açılan, beklenen ya da giren. Arama ad, firma, plaka, kart ve ziyaret numarasında.
export function gunKayitlariniOku(db: Db, gun: string, ara: string | null): Promise<ZiyaretSatiri[]> {
  return db.sorgu<ZiyaretSatiri>(
    `SELECT ${ZIYARET_SUTUNLARI} FROM ${ZIYARET_KAYNAGI}
      WHERE COALESCE(z.giris, z.beklenen_zaman, z.olusturma)::date = $1::date
        AND ($2::text IS NULL OR concat_ws(' ', z.ad, z.firma_adi, z.plaka, k.kart_no, z.ziyaret_no) ILIKE '%' || $2 || '%')
      ORDER BY COALESCE(z.giris, z.beklenen_zaman, z.olusturma) DESC, z.id DESC
      LIMIT 500`,
    [gun, ara],
  );
}

export async function bugun(db: Db): Promise<string> {
  return (await db.tek<{ gun: string }>('SELECT now()::date AS gun'))!.gun;
}

export function evSahibininZiyaretleri(db: Db, kisiId: number): Promise<ZiyaretSatiri[]> {
  return db.sorgu<ZiyaretSatiri>(
    `SELECT ${ZIYARET_SUTUNLARI} FROM ${ZIYARET_KAYNAGI}
      WHERE z.ev_sahibi_kisi_id = $1 AND (z.durum IN ('beklenen', 'iceride') OR z.olusturma > now() - interval '30 days')
      ORDER BY (z.durum = 'iceride') DESC, (z.durum = 'beklenen') DESC, COALESCE(z.giris, z.beklenen_zaman, z.olusturma) DESC, z.id DESC
      LIMIT 100`,
    [kisiId],
  );
}

export interface ZiyaretYazimi {
  ziyaretNo: string;
  ad: string;
  firmaAdi: string | null;
  telefon: string | null;
  neden: Neden;
  aciklama: string | null;
  plaka: string | null;
  evSahibiKisiId: number;
  beklenenZaman: string | null;
  ogleYemegi: boolean;
  olusturanKisiId: number;
}

export async function ziyaretEkle(db: Db, y: ZiyaretYazimi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO nizamiye_ziyaret (ziyaret_no, ad, firma_adi, telefon, neden, aciklama, plaka, ev_sahibi_kisi_id, beklenen_zaman,
        ogle_yemegi, durum, olusturan_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'beklenen', $11)
     RETURNING id`,
    [y.ziyaretNo, y.ad, y.firmaAdi, y.telefon, y.neden, y.aciklama, y.plaka, y.evSahibiKisiId, y.beklenenZaman, y.ogleYemegi, y.olusturanKisiId],
  );
  return satir!.id;
}

export interface GirisYazimi {
  kartId: number;
  kimlikTuru: KimlikTuru | null;
  kimlikSon4: string | null;
  atolye: boolean;
  dizustu: boolean;
  kvkkOnayi: boolean;
  ogleYemegi: boolean;
  girenKisiId: number;
}

// Ön kaydı olmayan ziyaretçi kayıt ve girişle birlikte açılır.
export async function habersizEkle(db: Db, y: ZiyaretYazimi, g: GirisYazimi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO nizamiye_ziyaret (ziyaret_no, ad, firma_adi, telefon, neden, aciklama, plaka, ev_sahibi_kisi_id, ogle_yemegi,
        olusturan_kisi_id, durum, giris, giren_kisi_id, kart_id, kimlik_goruldu, kimlik_turu, kimlik_son4, atolye, dizustu, kvkk_onayi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'iceride', now(), $11, $12, true, $13, $14, $15, $16, $17)
     RETURNING id`,
    [y.ziyaretNo, y.ad, y.firmaAdi, y.telefon, y.neden, y.aciklama, y.plaka, y.evSahibiKisiId, g.ogleYemegi, y.olusturanKisiId,
      g.girenKisiId, g.kartId, g.kimlikTuru, g.kimlikSon4, g.atolye, g.dizustu, g.kvkkOnayi],
  );
  return satir!.id;
}

export async function girisYaz(db: Db, id: number, y: GirisYazimi): Promise<void> {
  await db.sorgu(
    `UPDATE nizamiye_ziyaret
        SET durum = 'iceride', giris = now(), giren_kisi_id = $2, kart_id = $3, kimlik_goruldu = true, kimlik_turu = $4, kimlik_son4 = $5,
            atolye = $6, dizustu = $7, kvkk_onayi = $8, ogle_yemegi = $9, surum = surum + 1
      WHERE id = $1`,
    [id, y.girenKisiId, y.kartId, y.kimlikTuru, y.kimlikSon4, y.atolye, y.dizustu, y.kvkkOnayi, y.ogleYemegi],
  );
}

export async function cikisYaz(db: Db, id: number, y: { kartTeslim: boolean; ekipmanKontrol: boolean | null; cikaranKisiId: number }): Promise<void> {
  await db.sorgu(
    `UPDATE nizamiye_ziyaret
        SET durum = 'cikti', cikis = now(), cikaran_kisi_id = $2, kart_teslim = $3, ekipman_kontrol = $4, surum = surum + 1
      WHERE id = $1`,
    [id, y.cikaranKisiId, y.kartTeslim, y.ekipmanKontrol],
  );
}

export async function iptalYaz(db: Db, id: number, kisiId: number): Promise<void> {
  await db.sorgu(
    `UPDATE nizamiye_ziyaret SET durum = 'iptal', iptal_zaman = now(), iptal_eden_kisi_id = $2, surum = surum + 1 WHERE id = $1`,
    [id, kisiId],
  );
}

// Giriş geri alınınca kontroller de silinir: yeniden girişte görevli onları yeniden işaretler.
export async function girisiGeriAl(db: Db, id: number): Promise<void> {
  await db.sorgu(
    `UPDATE nizamiye_ziyaret
        SET durum = 'beklenen', giris = NULL, giren_kisi_id = NULL, kart_id = NULL, kimlik_goruldu = false, kimlik_turu = NULL,
            kimlik_son4 = NULL, atolye = false, dizustu = false, kvkk_onayi = false, surum = surum + 1
      WHERE id = $1`,
    [id],
  );
}

export async function habersizGirisiIptalEt(db: Db, id: number, kisiId: number): Promise<void> {
  await db.sorgu(
    `UPDATE nizamiye_ziyaret
        SET durum = 'iptal', iptal_zaman = now(), iptal_eden_kisi_id = $2, giris = NULL, giren_kisi_id = NULL, kart_id = NULL,
            surum = surum + 1
      WHERE id = $1`,
    [id, kisiId],
  );
}

export async function cikisiGeriAl(db: Db, id: number): Promise<void> {
  await db.sorgu(
    `UPDATE nizamiye_ziyaret
        SET durum = 'iceride', cikis = NULL, cikaran_kisi_id = NULL, kart_teslim = NULL, ekipman_kontrol = NULL, surum = surum + 1
      WHERE id = $1`,
    [id],
  );
}

export interface KartSatiri {
  id: number;
  kartNo: string;
  tur: KartTuru;
  izinliBolge: string | null;
  kayitDurumu: 'bos' | 'kayip' | 'hasarli';
  durumNotu: string | null;
  surum: number;
  ziyaretId: number | null;
  ziyaretNo: string | null;
  ziyaretAd: string | null;
  ziyaretGiris: string | null;
}

const KART_SECIMI = `SELECT k.id, k.kart_no AS "kartNo", k.tur, k.izinli_bolge AS "izinliBolge", k.durum AS "kayitDurumu",
    k.durum_notu AS "durumNotu", k.surum, z.id AS "ziyaretId", z.ziyaret_no AS "ziyaretNo", z.ad AS "ziyaretAd",
    ${zamanMetni('z.giris')} AS "ziyaretGiris"
  FROM nizamiye_kart k LEFT JOIN nizamiye_ziyaret z ON z.kart_id = k.id AND z.durum = 'iceride'`;

export function kartlariOku(db: Db): Promise<KartSatiri[]> {
  return db.sorgu<KartSatiri>(`${KART_SECIMI} ORDER BY k.tur, k.kart_no`);
}

export function kartKilitle(db: Db, id: number): Promise<KartSatiri | null> {
  return db.tek<KartSatiri>(`${KART_SECIMI} WHERE k.id = $1 FOR UPDATE OF k`, [id]);
}

export function bosKartlariOku(db: Db): Promise<BosKart[]> {
  return db.sorgu<BosKart>(
    `SELECT k.id, k.kart_no AS "kartNo", k.tur, k.izinli_bolge AS "izinliBolge" FROM nizamiye_kart k
      WHERE k.durum = 'bos' AND NOT EXISTS (SELECT 1 FROM nizamiye_ziyaret z WHERE z.kart_id = k.id AND z.durum = 'iceride')
      ORDER BY k.tur, k.kart_no`,
  );
}

export async function kartEkle(db: Db, y: { kartNo: string; tur: KartTuru; izinliBolge: string | null }): Promise<number> {
  return (await db.tek<{ id: number }>(
    'INSERT INTO nizamiye_kart (kart_no, tur, izinli_bolge) VALUES ($1, $2, $3) RETURNING id',
    [y.kartNo, y.tur, y.izinliBolge],
  ))!.id;
}

export async function kartDurumuYaz(db: Db, id: number, durum: 'bos' | 'kayip' | 'hasarli', not: string | null): Promise<void> {
  await db.sorgu('UPDATE nizamiye_kart SET durum = $2, durum_notu = $3, surum = surum + 1 WHERE id = $1', [id, durum, not]);
}

export async function menuSayilari(db: Db): Promise<{ iceride: number; sorunluKart: number }> {
  return (await db.tek<{ iceride: number; sorunluKart: number }>(
    `SELECT (SELECT count(*)::int FROM nizamiye_ziyaret WHERE durum = 'iceride') AS iceride,
            (SELECT count(*)::int FROM nizamiye_kart WHERE durum <> 'bos') AS "sorunluKart"`,
  ))!;
}

// Son 30 günde en çok ziyaretçi kabul eden kişiler önde; seçim listesinin geri kalanı kişiler modülünden gelir.
export function evSahibiSayilari(db: Db): Promise<{ kisiId: number; sayi: number }[]> {
  return db.sorgu<{ kisiId: number; sayi: number }>(
    `SELECT ev_sahibi_kisi_id AS "kisiId", count(*)::int AS sayi FROM nizamiye_ziyaret
      WHERE olusturma > now() - interval '30 days' AND durum <> 'iptal' GROUP BY ev_sahibi_kisi_id`,
  );
}

export function oncekiZiyaretler(db: Db, ara: string): Promise<{ ad: string; firmaAdi: string | null; telefon: string | null; plaka: string | null; sonGiris: string }[]> {
  return db.sorgu(
    `SELECT DISTINCT ON (lower(z.ad)) z.ad, z.firma_adi AS "firmaAdi", z.telefon, z.plaka, ${zamanMetni('z.giris')} AS "sonGiris"
       FROM nizamiye_ziyaret z
      WHERE z.ad IS NOT NULL AND z.giris IS NOT NULL AND z.ad ILIKE $1 || '%'
      ORDER BY lower(z.ad), z.giris DESC
      LIMIT 8`,
    [ara],
  );
}

// İptal dışındaki her durum sayılır: çıkan ziyaretçi de o gün yemeğe kaldıysa günün sayısından düşmemeli.
export async function yemegeKalanSayisi(db: Db, gun: string): Promise<number> {
  const s = await db.tek<{ sayi: number }>(
    `SELECT count(*)::int AS sayi FROM nizamiye_ziyaret
      WHERE ogle_yemegi AND durum <> 'iptal' AND COALESCE(giris, beklenen_zaman)::date = $1::date`,
    [gun],
  );
  return s!.sayi;
}

// PDKS aktarımı tek komutta: aktarım kaydı ve hareketler; aynı hareket ikinci kez yazılmaz, yazılan sayı döner.
export async function pdksAktarimYaz(
  db: Db,
  a: { dosyaAdi: string; aktaranKisiId: number; satirSayisi: number; eslesmeyen: number },
  hareketler: { kisiId: number; zaman: string; yon: 'giris' | 'cikis' }[],
): Promise<number> {
  const s = await db.tek<{ yeni: number }>(
    `WITH a AS (
       INSERT INTO nizamiye_pdks_aktarim (dosya_adi, aktaran_kisi_id, satir_sayisi, eslesmeyen) VALUES ($1, $2, $3, $4) RETURNING id
     ), h AS (
       INSERT INTO nizamiye_pdks_hareket (kisi_id, zaman, yon, aktarim_id)
       SELECT k, z, y, a.id FROM unnest($5::int[], $6::timestamptz[], $7::text[]) AS t(k, z, y), a
       ON CONFLICT ON CONSTRAINT nizamiye_pdks_hareket_tek DO NOTHING
       RETURNING 1
     )
     SELECT count(*)::int AS yeni FROM h`,
    [a.dosyaAdi, a.aktaranKisiId, a.satirSayisi, a.eslesmeyen,
      hareketler.map((h) => h.kisiId), hareketler.map((h) => h.zaman), hareketler.map((h) => h.yon)],
  );
  return s!.yeni;
}

// Her kişinin şimdiye kadarki son hareketi, dosyadan ve kart okuyucudan (ileri zamanlı satır alınmaz ama saat kaymasına karşı yine
// şimdiyle sınırlanır).
export function pdksSonHareketler(db: Db): Promise<{ kisiId: number; yon: 'giris' | 'cikis'; zaman: string }[]> {
  return db.sorgu(
    `SELECT DISTINCT ON (kisi_id) kisi_id AS "kisiId", yon, ${zamanMetni('zaman')} AS zaman
       FROM (SELECT kisi_id, yon, zaman, id, 0 AS kaynak FROM nizamiye_pdks_hareket WHERE zaman <= now()
             UNION ALL SELECT kisi_id, yon, zaman, id, 1 FROM nizamiye_pdks_cihaz_hareket WHERE zaman <= now()) h
      ORDER BY kisi_id, zaman DESC, kaynak DESC, id DESC`,
  );
}

// Son aktarım: dosya aktarımı ya da kart okuyucu gönderimi, hangisi sonraysa.
export async function pdksSonAktarim(db: Db): Promise<string | null> {
  return (await db.tek<{ zaman: string | null }>(
    `SELECT ${zamanMetni('greatest((SELECT max(zaman) FROM nizamiye_pdks_aktarim), (SELECT max(zaman) FROM nizamiye_pdks_gonderim))')} AS zaman`,
  ))!.zaman;
}

export interface PdksCihazSatiri { id: number; ad: string; ip: string; aktif: boolean; sonGonderim: string | null; surum: number }
const CIHAZ_SECIMI = `SELECT c.id, c.ad, host(c.ip) AS ip, c.aktif, c.surum,
    ${zamanMetni('(SELECT max(g.zaman) FROM nizamiye_pdks_gonderim g WHERE g.cihaz_id = c.id)')} AS "sonGonderim"
  FROM nizamiye_pdks_cihaz c`;

export const pdksCihazlari = (db: Db): Promise<PdksCihazSatiri[]> => db.sorgu<PdksCihazSatiri>(`${CIHAZ_SECIMI} ORDER BY c.ad, c.id`);
export const pdksCihazi = (db: Db, id: number): Promise<PdksCihazSatiri | null> => db.tek<PdksCihazSatiri>(`${CIHAZ_SECIMI} WHERE c.id = $1`, [id]);

export async function pdksCihazEkle(db: Db, c: { ad: string; ip: string; ozet: string; kisiId: number }): Promise<number> {
  return (await db.tek<{ id: number }>(
    'INSERT INTO nizamiye_pdks_cihaz (ad, ip, anahtar_ozeti, olusturan_kisi_id) VALUES ($1, $2::inet, $3, $4) RETURNING id',
    [c.ad, c.ip, c.ozet, c.kisiId],
  ))!.id;
}

// Koşullu yazma: sürüm tutmazsa satır dönmez.
export async function pdksCihazAnahtarYaz(db: Db, id: number, surum: number, ozet: string): Promise<boolean> {
  return (await db.tek('UPDATE nizamiye_pdks_cihaz SET anahtar_ozeti = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum, ozet])) !== null;
}

export async function pdksCihazDurumYaz(db: Db, id: number, surum: number, aktif: boolean): Promise<boolean> {
  return (await db.tek('UPDATE nizamiye_pdks_cihaz SET aktif = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum, aktif])) !== null;
}

// Gelen istek yalnız etkin cihazın kayıtlı adresiyle eşleşir.
export const pdksEtkinCihaz = (db: Db, ip: string): Promise<{ id: number; ozet: string } | null> =>
  db.tek('SELECT id, anahtar_ozeti AS ozet FROM nizamiye_pdks_cihaz WHERE ip = $1::inet AND aktif', [ip]);

// Gönderim, ham gövde ve hareketler tek komutta. Dosyadan zaten gelmiş hareket kart okuyucudan ikinci kez yazılmaz; yeni sayısı döner.
export async function pdksGonderimYaz(
  db: Db,
  g: { cihazId: number; ip: string; govde: string; satirSayisi: number; eslesmeyen: number; hatali: number },
  hareketler: { kisiId: number; zaman: string; yon: 'giris' | 'cikis' }[],
): Promise<number> {
  const s = await db.tek<{ yeni: number }>(
    `WITH g AS (
       INSERT INTO nizamiye_pdks_gonderim (cihaz_id, ip, satir_sayisi, eslesmeyen, hatali) VALUES ($1, $2::inet, $3, $4, $5) RETURNING id
     ), ham AS (
       INSERT INTO nizamiye_pdks_gonderim_ham (gonderim_id, govde) SELECT g.id, $6 FROM g
     ), h AS (
       INSERT INTO nizamiye_pdks_cihaz_hareket (kisi_id, zaman, yon, gonderim_id)
       SELECT k, z, y, g.id FROM unnest($7::int[], $8::timestamptz[], $9::text[]) AS t(k, z, y), g
        WHERE NOT EXISTS (SELECT 1 FROM nizamiye_pdks_hareket d WHERE d.kisi_id = t.k AND d.zaman = t.z AND d.yon = t.y)
       ON CONFLICT ON CONSTRAINT nizamiye_pdks_cihaz_hareket_tek DO NOTHING
       RETURNING 1
     )
     SELECT count(*)::int AS yeni FROM h`,
    [g.cihazId, g.ip, g.satirSayisi, g.eslesmeyen, g.hatali, g.govde,
      hareketler.map((h) => h.kisiId), hareketler.map((h) => h.zaman), hareketler.map((h) => h.yon)],
  );
  return s!.yeni;
}

// Saklama süresi dolan ham gövde silinir; gönderim satırı ve hareketler kalır. Silinen sayı döner.
export async function pdksHamTemizle(db: Db, gun: number): Promise<number> {
  return (await db.sorgu(
    `DELETE FROM nizamiye_pdks_gonderim_ham h USING nizamiye_pdks_gonderim g
      WHERE g.id = h.gonderim_id AND g.zaman < now() - make_interval(days => $1) RETURNING 1`,
    [gun],
  )).length;
}

// Personel kartı (1326): yalnız etkin kartlar listelenir; kapanan satır kalır ama görünmez.
export interface PersonelKartSatiri { id: number; kisiId: number; kartSon4: string; kaydedildi: string; surum: number }
const PERSONEL_KART_SECIMI = `SELECT id, kisi_id AS "kisiId", kart_son4 AS "kartSon4", ${zamanMetni('kaydedildi')} AS kaydedildi, surum
  FROM nizamiye_personel_kart`;

export const personelKartlari = (db: Db): Promise<PersonelKartSatiri[]> =>
  db.sorgu<PersonelKartSatiri>(`${PERSONEL_KART_SECIMI} WHERE kapandi IS NULL ORDER BY kaydedildi DESC, id DESC`);

export const personelKarti = (db: Db, id: number): Promise<PersonelKartSatiri | null> =>
  db.tek<PersonelKartSatiri>(`${PERSONEL_KART_SECIMI} WHERE id = $1 AND kapandi IS NULL`, [id]);

export async function personelKartEkle(db: Db, k: { kisiId: number; ozet: string; son4: string; kaydeden: number }): Promise<number> {
  return (await db.tek<{ id: number }>(
    'INSERT INTO nizamiye_personel_kart (kisi_id, kart_ozeti, kart_son4, kaydeden_kisi_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [k.kisiId, k.ozet, k.son4, k.kaydeden],
  ))!.id;
}

// Koşullu kapatma: kapalı ya da sürümü tutmayan satır dönmez.
export async function personelKartKapat(db: Db, id: number, surum: number, kapatan: number): Promise<boolean> {
  return (await db.tek(
    `UPDATE nizamiye_personel_kart SET kapandi = now(), kapatan_kisi_id = $3, surum = surum + 1
      WHERE id = $1 AND surum = $2 AND kapandi IS NULL RETURNING id`,
    [id, surum, kapatan],
  )) !== null;
}

export async function personelKartSahibi(db: Db, ozet: string): Promise<number | null> {
  return (await db.tek<{ kisiId: number }>(
    'SELECT kisi_id AS "kisiId" FROM nizamiye_personel_kart WHERE kart_ozeti = $1 AND kapandi IS NULL', [ozet],
  ))?.kisiId ?? null;
}
