import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type {
  AlarmKaydi, AmbarKaydi, DurusKaydi, EslemeTuru, IlerlemeKaydi, IsEmriDurumuKaydi, KaliteKaydi, ListeKaydi, ListeTuru, MakineDurumu, MakineOkumasi,
  OkumaKaynagi, RedKaydi, TanimIzi, TanimKaydi, TanimTuru, CevrimKaydi, HesapTuru, OeeKaydi,
} from './kurallar.ts';

/* ---------------- eşleme ---------------- */

export interface EslemeSatiri {
  tmiId: number;
  smartesKod: string;
  surum: number;
}

export function eslemeler(db: Db, tur: EslemeTuru): Promise<EslemeSatiri[]> {
  return db.sorgu<EslemeSatiri>(
    'SELECT tmi_id AS "tmiId", smartes_kod AS "smartesKod", surum FROM smartes_esleme WHERE tur = $1 ORDER BY tmi_id',
    [tur],
  );
}

export function eslemeKilitle(db: Db, tur: EslemeTuru, tmiId: number): Promise<EslemeSatiri | null> {
  return db.tek<EslemeSatiri>(
    'SELECT tmi_id AS "tmiId", smartes_kod AS "smartesKod", surum FROM smartes_esleme WHERE tur = $1 AND tmi_id = $2 FOR UPDATE',
    [tur, tmiId],
  );
}

export async function eslemeEkle(db: Db, tur: EslemeTuru, tmiId: number, kod: string, kisiId: number): Promise<number> {
  const r = await db.tek<{ surum: number }>(
    `INSERT INTO smartes_esleme (tur, tmi_id, smartes_kod, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tur, tmi_id) DO NOTHING RETURNING surum`,
    [tur, tmiId, kod, kisiId],
  );
  return r?.surum ?? 0;
}

// Kod değişmediyse satıra yazılmaz, sürüm artmaz: açık başka formlar boşuna 409 almasın. Sürüm yine denetlenir.
export async function eslemeGuncelle(db: Db, tur: EslemeTuru, tmiId: number, kod: string, kisiId: number, surum: number): Promise<number | null> {
  const r = await db.tek<{ surum: number | null }>(
    `WITH hedef AS (
       SELECT surum, smartes_kod FROM smartes_esleme WHERE tur = $1 AND tmi_id = $2 AND surum = $5 FOR UPDATE
     ), guncel AS (
       UPDATE smartes_esleme e SET smartes_kod = $3, guncelleyen_kisi_id = $4, guncelleme = now(), surum = e.surum + 1
       FROM hedef WHERE e.tur = $1 AND e.tmi_id = $2 AND hedef.smartes_kod <> $3 RETURNING e.surum
     )
     SELECT COALESCE((SELECT surum FROM guncel), (SELECT surum FROM hedef)) AS surum`,
    [tur, tmiId, kod, kisiId, surum],
  );
  return r?.surum ?? null;
}

export async function eslemeSil(db: Db, tur: EslemeTuru, tmiId: number, surum: number): Promise<boolean> {
  const r = await db.sorgu('DELETE FROM smartes_esleme WHERE tur = $1 AND tmi_id = $2 AND surum = $3 RETURNING 1', [tur, tmiId, surum]);
  return r.length > 0;
}

/* ---------------- okuma ---------------- */

export interface OkumaSatiri {
  kaynak: OkumaKaynagi;
  sonBitis: Date | null;
  sonDeneme: Date;
  sonSonuc: 'tamam' | 'hata';
  sonHata: string | null;
  okunan: number | null;
  kimliksiz: number | null;
}

const OKUMA_ALANLARI = `kaynak, son_bitis AS "sonBitis", son_deneme AS "sonDeneme", son_sonuc AS "sonSonuc", son_hata AS "sonHata", okunan, kimliksiz`;

export function okuma(db: Db, kaynak: OkumaKaynagi): Promise<OkumaSatiri | null> {
  return db.tek<OkumaSatiri>(`SELECT ${OKUMA_ALANLARI} FROM smartes_okuma WHERE kaynak = $1`, [kaynak]);
}

export interface OkumaOzeti {
  kaynak: OkumaKaynagi;
  sonBitis: string | null;
  sonDeneme: string;
  sonSonuc: 'tamam' | 'hata';
  sonHata: string | null;
  okunan: number | null;
  kimliksiz: number | null;
}

export function okumalar(db: Db): Promise<OkumaOzeti[]> {
  return db.sorgu<OkumaOzeti>(
    `SELECT kaynak, ${zamanMetni('son_bitis')} AS "sonBitis", ${zamanMetni('son_deneme')} AS "sonDeneme", son_sonuc AS "sonSonuc",
       son_hata AS "sonHata", okunan, kimliksiz FROM smartes_okuma ORDER BY kaynak`,
  );
}

export async function okumaBasarili(db: Db, kaynak: OkumaKaynagi, sonBitis: Date, zaman: Date, okunan: number, kimliksiz: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_okuma (kaynak, son_bitis, son_deneme, son_sonuc, son_hata, okunan, kimliksiz) VALUES ($1, $2, $3, 'tamam', NULL, $4, $5)
     ON CONFLICT (kaynak) DO UPDATE SET son_bitis = EXCLUDED.son_bitis, son_deneme = EXCLUDED.son_deneme, son_sonuc = 'tamam', son_hata = NULL,
       okunan = EXCLUDED.okunan, kimliksiz = EXCLUDED.kimliksiz`,
    [kaynak, sonBitis, zaman, okunan, kimliksiz],
  );
}

// Pencere ilerlemez: sonraki tur aynı aralığı yeniden ister.
export async function okumaHatali(db: Db, kaynak: OkumaKaynagi, zaman: Date, hata: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_okuma (kaynak, son_bitis, son_deneme, son_sonuc, son_hata) VALUES ($1, NULL, $2, 'hata', $3)
     ON CONFLICT (kaynak) DO UPDATE SET son_deneme = EXCLUDED.son_deneme, son_sonuc = 'hata', son_hata = EXCLUDED.son_hata`,
    [kaynak, zaman, hata],
  );
}

// Atlanan pencere (KD-044): okuma ilerler ama sonuç "hata" kalır ki atlama ekranda görünsün; sonraki başarılı okuma temizler.
export async function okumaAtlandi(db: Db, kaynak: OkumaKaynagi, sonBitis: Date, zaman: Date, hata: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_okuma (kaynak, son_bitis, son_deneme, son_sonuc, son_hata) VALUES ($1, $2, $3, 'hata', $4)
     ON CONFLICT (kaynak) DO UPDATE SET son_bitis = EXCLUDED.son_bitis, son_deneme = EXCLUDED.son_deneme, son_sonuc = 'hata',
       son_hata = EXCLUDED.son_hata`,
    [kaynak, sonBitis, zaman, hata],
  );
}

/* ---------------- okunan kayıtlar ---------------- */

const ham = (k: { ham: unknown }): string => JSON.stringify(k.ham);

// Yeniden okunan kayıt sayılarıyla güncellenir; işaret durumu korunur.
export async function isEmriDurumuYaz(db: Db, k: IsEmriDurumuKaydi, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_is_emri_durumu (smartes_id, is_emri_no, erp_id, istasyon_kodu, operasyon_kodu, makine_kodu, stok_no, saglam, red,
       makine_saglam, makine_red, baslangic, bitis, bitti, erp_saglam, erp_red, ham, ilk_okuma, son_okuma)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $18)
     ON CONFLICT (smartes_id) DO UPDATE SET is_emri_no = EXCLUDED.is_emri_no, erp_id = EXCLUDED.erp_id, istasyon_kodu = EXCLUDED.istasyon_kodu,
       operasyon_kodu = EXCLUDED.operasyon_kodu, makine_kodu = EXCLUDED.makine_kodu, stok_no = EXCLUDED.stok_no, saglam = EXCLUDED.saglam,
       red = EXCLUDED.red, makine_saglam = EXCLUDED.makine_saglam, makine_red = EXCLUDED.makine_red, baslangic = EXCLUDED.baslangic,
       bitis = EXCLUDED.bitis, bitti = EXCLUDED.bitti, erp_saglam = EXCLUDED.erp_saglam, erp_red = EXCLUDED.erp_red, ham = EXCLUDED.ham,
       son_okuma = EXCLUDED.son_okuma`,
    [k.smartesId, k.isEmriNo, k.erpId, k.istasyonKodu, k.operasyonKodu, k.makineKodu, k.stokNo, k.saglam, k.red, k.makineSaglam, k.makineRed,
      k.baslangic, k.bitis, k.bitti, k.erpSaglam, k.erpRed, ham(k), zaman],
  );
}

export async function durusYaz(db: Db, k: DurusKaydi, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_durus (smartes_id, makine_kodu, neden_kodu, is_emri_no, baslangic, bitis, ham, ilk_okuma, son_okuma)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
     ON CONFLICT (smartes_id) DO UPDATE SET makine_kodu = EXCLUDED.makine_kodu, neden_kodu = EXCLUDED.neden_kodu, is_emri_no = EXCLUDED.is_emri_no,
       baslangic = EXCLUDED.baslangic, bitis = EXCLUDED.bitis, ham = EXCLUDED.ham, son_okuma = EXCLUDED.son_okuma`,
    [k.smartesId, k.makineKodu, k.nedenKodu, k.isEmriNo, k.baslangic, k.bitis, ham(k), zaman],
  );
}

export async function alarmYaz(db: Db, k: AlarmKaydi, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_alarm (smartes_id, makine_kodu, alarm_kodu, aciklama, baslangic, bitis, ham, ilk_okuma, son_okuma)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
     ON CONFLICT (smartes_id) DO UPDATE SET makine_kodu = EXCLUDED.makine_kodu, alarm_kodu = EXCLUDED.alarm_kodu, aciklama = EXCLUDED.aciklama,
       baslangic = EXCLUDED.baslangic, bitis = EXCLUDED.bitis, ham = EXCLUDED.ham, son_okuma = EXCLUDED.son_okuma`,
    [k.smartesId, k.makineKodu, k.alarmKodu, k.aciklama, k.baslangic, k.bitis, ham(k), zaman],
  );
}

/* ---------------- giden kutusu ---------------- */

export interface GidenSatiri {
  isEmriId: number;
  smartesIsEmriNo: string;
  ozet: string | null;
  durum: 'gonderildi' | 'hata' | 'kapandi';
  ardisikHata: number;
  sonrakiDeneme: Date | null;
}

const GIDEN_ALANLARI = `is_emri_id AS "isEmriId", smartes_is_emri_no AS "smartesIsEmriNo", ozet, durum, ardisik_hata AS "ardisikHata",
  sonraki_deneme AS "sonrakiDeneme"`;

export function gidenSatirlari(db: Db, idler: readonly number[]): Promise<GidenSatiri[]> {
  if (idler.length === 0) return Promise.resolve([]);
  return db.sorgu<GidenSatiri>(`SELECT ${GIDEN_ALANLARI} FROM smartes_giden WHERE is_emri_id = ANY($1::int[])`, [idler]);
}

// Gönderilmiş ama artık gönderim listesinde olmayan (bitmiş, iptal, taslağa dönmüş) iş emirleri: kapanış bildirimi bekler.
export function kapanacaklar(db: Db, listedekiler: readonly number[], simdi: Date, sinir: number): Promise<GidenSatiri[]> {
  return db.sorgu<GidenSatiri>(
    `SELECT ${GIDEN_ALANLARI} FROM smartes_giden
     WHERE NOT (is_emri_id = ANY($1::int[])) AND (durum = 'gonderildi' OR (durum = 'hata' AND ozet IS NOT NULL AND sonraki_deneme <= $2))
     ORDER BY son_deneme, is_emri_id LIMIT $3`,
    [listedekiler, simdi, sinir],
  );
}

export interface GidenDenemesi {
  isEmriId: number;
  smartesIsEmriNo: string;
  zaman: Date;
  sonuc: { tur: 'gonderildi'; ozet: string } | { tur: 'kapandi' } | { tur: 'hata'; hata: string; sonraki: Date };
}

// Hatada son başarılı özet korunur: kapanış bildirimi gönderilmiş iş emrini tanır.
export async function gidenDenemesiYaz(db: Db, d: GidenDenemesi): Promise<void> {
  const s = d.sonuc;
  await db.sorgu(
    `INSERT INTO smartes_giden AS g (is_emri_id, smartes_is_emri_no, ozet, durum, deneme_sayisi, ardisik_hata, son_deneme, son_hata, sonraki_deneme)
     VALUES ($1, $2, $3, $4, 1, CASE WHEN $4 = 'hata' THEN 1 ELSE 0 END, $5, $6, $7)
     ON CONFLICT (is_emri_id) DO UPDATE SET smartes_is_emri_no = EXCLUDED.smartes_is_emri_no,
       ozet = CASE WHEN EXCLUDED.durum = 'gonderildi' THEN EXCLUDED.ozet ELSE g.ozet END,
       durum = EXCLUDED.durum, deneme_sayisi = g.deneme_sayisi + 1,
       ardisik_hata = CASE WHEN EXCLUDED.durum = 'hata' THEN g.ardisik_hata + 1 ELSE 0 END,
       son_deneme = EXCLUDED.son_deneme, son_hata = EXCLUDED.son_hata, sonraki_deneme = EXCLUDED.sonraki_deneme`,
    [d.isEmriId, d.smartesIsEmriNo, s.tur === 'gonderildi' ? s.ozet : null, s.tur, d.zaman, s.tur === 'hata' ? s.hata : null,
      s.tur === 'hata' ? s.sonraki : null],
  );
}

/* ---------------- ekran listeleri ---------------- */

export interface Sayilar {
  isEmriDurumu: number;
  durus: number;
  alarm: number;
  gidenGonderilen: number;
  gidenHatali: number;
}

export async function sayilar(db: Db): Promise<Sayilar> {
  const r = await db.tek<Sayilar>(
    `SELECT (SELECT count(*) FROM smartes_is_emri_durumu)::int AS "isEmriDurumu",
       (SELECT count(*) FROM smartes_durus)::int AS durus,
       (SELECT count(*) FROM smartes_alarm)::int AS alarm,
       (SELECT count(*) FROM smartes_giden WHERE durum = 'gonderildi')::int AS "gidenGonderilen",
       (SELECT count(*) FROM smartes_giden WHERE durum = 'hata')::int AS "gidenHatali"`,
  );
  if (r === null) throw new Error('Sayılar okunamadı.');
  return r;
}

export function isEmriDurumuSay(db: Db): Promise<number> {
  return db.tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_is_emri_durumu').then((r) => r?.n ?? 0);
}

export function isEmriDurumuSatirlari<T>(db: Db, d: Dilim): Promise<T[]> {
  return db.sorgu<T>(
    `SELECT smartes_id AS "smartesId", is_emri_no AS "isEmriNo", erp_id AS "erpId", istasyon_kodu AS "istasyonKodu", operasyon_kodu AS "operasyonKodu",
       makine_kodu AS "makineKodu", stok_no AS "stokNo", saglam, red, makine_saglam AS "makineSaglam", makine_red AS "makineRed",
       ${zamanMetni('baslangic')} AS baslangic, ${zamanMetni('bitis')} AS bitis, ${zamanMetni('son_okuma')} AS "sonOkuma"
     FROM smartes_is_emri_durumu ORDER BY son_okuma DESC, smartes_id DESC LIMIT $1 OFFSET $2`,
    [d.sinir, d.atla],
  );
}

export function durusSay(db: Db): Promise<number> {
  return db.tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_durus').then((r) => r?.n ?? 0);
}

export function durusSatirlari<T>(db: Db, d: Dilim): Promise<T[]> {
  return db.sorgu<T>(
    `SELECT smartes_id AS "smartesId", makine_kodu AS "makineKodu", neden_kodu AS "nedenKodu", is_emri_no AS "isEmriNo",
       ${zamanMetni('baslangic')} AS baslangic, ${zamanMetni('bitis')} AS bitis
     FROM smartes_durus ORDER BY baslangic DESC NULLS LAST, smartes_id DESC LIMIT $1 OFFSET $2`,
    [d.sinir, d.atla],
  );
}

export function alarmSay(db: Db): Promise<number> {
  return db.tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_alarm').then((r) => r?.n ?? 0);
}

export function alarmSatirlari<T>(db: Db, d: Dilim): Promise<T[]> {
  return db.sorgu<T>(
    `SELECT smartes_id AS "smartesId", makine_kodu AS "makineKodu", alarm_kodu AS "alarmKodu", aciklama,
       ${zamanMetni('baslangic')} AS baslangic, ${zamanMetni('bitis')} AS bitis
     FROM smartes_alarm ORDER BY baslangic DESC NULLS LAST, smartes_id DESC LIMIT $1 OFFSET $2`,
    [d.sinir, d.atla],
  );
}

export function gidenSay(db: Db): Promise<number> {
  return db.tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_giden').then((r) => r?.n ?? 0);
}

export function gidenListeSatirlari<T>(db: Db, d: Dilim): Promise<T[]> {
  return db.sorgu<T>(
    `SELECT is_emri_id AS "isEmriId", smartes_is_emri_no AS "smartesIsEmriNo", durum, deneme_sayisi AS "denemeSayisi",
       ${zamanMetni('son_deneme')} AS "sonDeneme", son_hata AS "sonHata", ${zamanMetni('sonraki_deneme')} AS "sonrakiDeneme"
     FROM smartes_giden ORDER BY son_deneme DESC, is_emri_id DESC LIMIT $1 OFFSET $2`,
    [d.sinir, d.atla],
  );
}

/* ---------------- kalite, hurda, ambar okuması ---------------- */

export interface AkisIzi {
  akis: string;
  sonBitis: Date | null;
  sonDeneme: Date;
  sonSonuc: 'tamam' | 'hata';
  sonHata: string | null;
  okunan: number | null;
  kimliksiz: number | null;
}

export function akisIzi(db: Db, akis: string): Promise<AkisIzi | null> {
  return db.tek<AkisIzi>(
    `SELECT akis, son_bitis AS "sonBitis", son_deneme AS "sonDeneme", son_sonuc AS "sonSonuc", son_hata AS "sonHata", okunan, kimliksiz
     FROM smartes_akis_izi WHERE akis = $1`,
    [akis],
  );
}

export interface AkisIziOzeti {
  akis: string;
  sonDeneme: string;
  sonSonuc: 'tamam' | 'hata';
  sonHata: string | null;
}

export function akisIzleri(db: Db): Promise<AkisIziOzeti[]> {
  return db.sorgu<AkisIziOzeti>(
    `SELECT akis, ${zamanMetni('son_deneme')} AS "sonDeneme", son_sonuc AS "sonSonuc", son_hata AS "sonHata" FROM smartes_akis_izi ORDER BY akis`,
  );
}

export async function akisBasarili(db: Db, akis: string, sonBitis: Date | null, zaman: Date, okunan: number | null, kimliksiz: number | null): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_akis_izi (akis, son_bitis, son_deneme, son_sonuc, son_hata, okunan, kimliksiz) VALUES ($1, $2, $3, 'tamam', NULL, $4, $5)
     ON CONFLICT (akis) DO UPDATE SET son_bitis = EXCLUDED.son_bitis, son_deneme = EXCLUDED.son_deneme, son_sonuc = 'tamam', son_hata = NULL,
       okunan = EXCLUDED.okunan, kimliksiz = EXCLUDED.kimliksiz`,
    [akis, sonBitis, zaman, okunan, kimliksiz],
  );
}

// Pencere ilerlemez (son_bitis olduğu gibi kalır): sonraki tur aynı aralığı yeniden ister.
export async function akisHatali(db: Db, akis: string, zaman: Date, hata: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_akis_izi (akis, son_bitis, son_deneme, son_sonuc, son_hata) VALUES ($1, NULL, $2, 'hata', $3)
     ON CONFLICT (akis) DO UPDATE SET son_deneme = EXCLUDED.son_deneme, son_sonuc = 'hata', son_hata = EXCLUDED.son_hata`,
    [akis, zaman, hata],
  );
}

// Atlanan pencere (KD-044): okuma ilerler ama sonuç "hata" kalır ki atlama görünsün; sonraki başarılı okuma temizler.
export async function akisAtlandi(db: Db, akis: string, sonBitis: Date, zaman: Date, hata: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_akis_izi (akis, son_bitis, son_deneme, son_sonuc, son_hata) VALUES ($1, $2, $3, 'hata', $4)
     ON CONFLICT (akis) DO UPDATE SET son_bitis = EXCLUDED.son_bitis, son_deneme = EXCLUDED.son_deneme, son_sonuc = 'hata', son_hata = EXCLUDED.son_hata`,
    [akis, sonBitis, zaman, hata],
  );
}

export async function redYaz(db: Db, k: RedKaydi, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_red (smartes_id, is_emri_no, istasyon_kodu, makine_kodu, stok_no, adet, neden_kodu, neden, zaman, ham, ilk_okuma, son_okuma)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11)
     ON CONFLICT (smartes_id) DO UPDATE SET is_emri_no = EXCLUDED.is_emri_no, istasyon_kodu = EXCLUDED.istasyon_kodu, makine_kodu = EXCLUDED.makine_kodu,
       stok_no = EXCLUDED.stok_no, adet = EXCLUDED.adet, neden_kodu = EXCLUDED.neden_kodu, neden = EXCLUDED.neden, zaman = EXCLUDED.zaman,
       ham = EXCLUDED.ham, son_okuma = EXCLUDED.son_okuma`,
    [k.smartesId, k.isEmriNo, k.istasyonKodu, k.makineKodu, k.stokNo, k.adet, k.nedenKodu, k.neden, k.zaman, ham(k), zaman],
  );
}

export async function ambarYaz(db: Db, k: AmbarKaydi, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_ambar_hareketi (smartes_id, is_emri_no, stok_no, ambar_kodu, hareket_turu, miktar, zaman, ham, ilk_okuma, son_okuma)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
     ON CONFLICT (smartes_id) DO UPDATE SET is_emri_no = EXCLUDED.is_emri_no, stok_no = EXCLUDED.stok_no, ambar_kodu = EXCLUDED.ambar_kodu,
       hareket_turu = EXCLUDED.hareket_turu, miktar = EXCLUDED.miktar, zaman = EXCLUDED.zaman, ham = EXCLUDED.ham, son_okuma = EXCLUDED.son_okuma`,
    [k.smartesId, k.isEmriNo, k.stokNo, k.ambarKodu, k.hareketTuru, k.miktar, k.zaman, ham(k), zaman],
  );
}

export async function kaliteYaz(db: Db, k: KaliteKaydi, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_kalite_kontrol (smartes_id, is_emri_no, stok_no, istasyon_kodu, makine_kodu, olcum_adi, olcum_degeri, sonuc, zaman, ham, ilk_okuma, son_okuma)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11)
     ON CONFLICT (smartes_id) DO UPDATE SET is_emri_no = EXCLUDED.is_emri_no, stok_no = EXCLUDED.stok_no, istasyon_kodu = EXCLUDED.istasyon_kodu,
       makine_kodu = EXCLUDED.makine_kodu, olcum_adi = EXCLUDED.olcum_adi, olcum_degeri = EXCLUDED.olcum_degeri, sonuc = EXCLUDED.sonuc,
       zaman = EXCLUDED.zaman, ham = EXCLUDED.ham, son_okuma = EXCLUDED.son_okuma`,
    [k.smartesId, k.isEmriNo, k.stokNo, k.istasyonKodu, k.makineKodu, k.olcumAdi, k.olcumDegeri, k.sonuc, k.zaman, ham(k), zaman],
  );
}

export interface KaliteAmbarSayilari {
  red: number;
  ambar: number;
  kalite: number;
}

export async function kaliteAmbarSayilari(db: Db): Promise<KaliteAmbarSayilari> {
  const r = await db.tek<KaliteAmbarSayilari>(
    `SELECT (SELECT count(*) FROM smartes_red)::int AS red, (SELECT count(*) FROM smartes_ambar_hareketi)::int AS ambar,
       (SELECT count(*) FROM smartes_kalite_kontrol)::int AS kalite`,
  );
  if (r === null) throw new Error('Sayılar okunamadı.');
  return r;
}

/* ---------------- tanım gönderimi ---------------- */

export interface TanimSatiri extends TanimIzi {
  tmiId: number;
}

export function tanimIzleri(db: Db, tur: TanimTuru): Promise<TanimSatiri[]> {
  return db.sorgu<TanimSatiri>(
    `SELECT tmi_id AS "tmiId", durum, ardisik_hata AS "ardisikHata", sonraki_deneme AS "sonrakiDeneme" FROM smartes_tanim_giden WHERE tur = $1`,
    [tur],
  );
}

// Niyet: bu kayıt için tanım isteği bir sonraki turda gidecek. Yeni satır ya da bekleme süresi dolmuş hata satırı; başka durum değişmez.
export async function tanimNiyetiYaz(db: Db, k: TanimKaydi, zaman: Date): Promise<boolean> {
  const r = await db.sorgu(
    `INSERT INTO smartes_tanim_giden AS g (tur, tmi_id, kod, durum, niyet_zamani) VALUES ($1, $2, $3, 'niyet', $4)
     ON CONFLICT (tur, tmi_id) DO UPDATE SET kod = EXCLUDED.kod, durum = 'niyet', niyet_zamani = EXCLUDED.niyet_zamani, son_hata = NULL, sonraki_deneme = NULL
     WHERE g.durum = 'hata' RETURNING 1`,
    [k.tur, k.tmiId, k.kod, zaman],
  );
  return r.length > 0;
}

export type TanimSonucu =
  | { tur: 'gonderildi' }
  | { tur: 'zaten-var' }
  | { tur: 'hata'; hata: string; sonraki: Date }
  | { tur: 'belirsiz'; hata: string };

// `istekAtildi`: sonuç bir istekten geldi (deneme sayılır). Yalnız niyet satırı sonuçlanır; başka durumdaki satır değişmez.
export async function tanimSonucuYaz(db: Db, tur: TanimTuru, tmiId: number, zaman: Date, sonuc: TanimSonucu, istekAtildi: boolean): Promise<void> {
  await db.sorgu(
    `UPDATE smartes_tanim_giden SET durum = $3, deneme_sayisi = deneme_sayisi + $4, son_deneme = $5, son_hata = $6, sonraki_deneme = $7,
       ardisik_hata = CASE WHEN $3 = 'hata' THEN ardisik_hata + 1 WHEN $3 = 'belirsiz' THEN ardisik_hata ELSE 0 END
     WHERE tur = $1 AND tmi_id = $2 AND durum = 'niyet'`,
    [tur, tmiId, sonuc.tur, istekAtildi ? 1 : 0, zaman, 'hata' in sonuc ? sonuc.hata : null, sonuc.tur === 'hata' ? sonuc.sonraki : null],
  );
}

export interface TanimSayilari {
  gonderilen: number;
  hatali: number;
}

export async function tanimSayilari(db: Db): Promise<TanimSayilari> {
  const r = await db.tek<TanimSayilari>(
    `SELECT count(*) FILTER (WHERE durum IN ('gonderildi', 'zaten-var'))::int AS gonderilen,
       count(*) FILTER (WHERE durum IN ('hata', 'belirsiz'))::int AS hatali FROM smartes_tanim_giden`,
  );
  if (r === null) throw new Error('Sayılar okunamadı.');
  return r;
}

/* ---------------- Canlı makine panosu: makinenin son okuması, durum değişimleri, iş emri ilerlemesi ---------------- */

// Tek deyim: son okuma üstüne yazılır; durum (ya da karşılığı bilinmeyen durum kodu) değiştiyse değişim satırı eklenir ve durumun
// başlangıcı o an olur. Değişmediyse başlangıç korunur.
export async function makineYaz(db: Db, m: MakineOkumasi, zaman: Date): Promise<void> {
  await db.sorgu(
    `WITH onceki AS (
       SELECT durum, durum_kodu FROM smartes_makine_durumu WHERE makine_kodu = $1 FOR UPDATE
     ), degisim AS (
       INSERT INTO smartes_makine_durum_degisimi (makine_kodu, zaman, eski, yeni, aciklama)
       SELECT $1, $19, (SELECT durum FROM onceki), $4, $20
        WHERE NOT EXISTS (SELECT 1 FROM onceki WHERE durum = $4 AND ($4 <> 'bilinmiyor' OR durum_kodu IS NOT DISTINCT FROM $5))
       RETURNING 1
     )
     INSERT INTO smartes_makine_durumu (makine_kodu, smartes_makine_id, makine_adi, durum, durum_kodu, durum_baslangic, mod, alarm, uyari, program_no,
       program_adi, sayac, sayac_toplam, eksen_hizi, eksen_orani, spindle_yuku, spindle_orani, spindle_hizi, takim_cebi, okundu)
     VALUES ($1, $2, $3, $4, $5, $19, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (makine_kodu) DO UPDATE SET smartes_makine_id = EXCLUDED.smartes_makine_id, makine_adi = EXCLUDED.makine_adi, durum = EXCLUDED.durum,
       durum_kodu = EXCLUDED.durum_kodu, mod = EXCLUDED.mod, alarm = EXCLUDED.alarm, uyari = EXCLUDED.uyari, program_no = EXCLUDED.program_no,
       program_adi = EXCLUDED.program_adi, sayac = EXCLUDED.sayac, sayac_toplam = EXCLUDED.sayac_toplam, eksen_hizi = EXCLUDED.eksen_hizi,
       eksen_orani = EXCLUDED.eksen_orani, spindle_yuku = EXCLUDED.spindle_yuku, spindle_orani = EXCLUDED.spindle_orani,
       spindle_hizi = EXCLUDED.spindle_hizi, takim_cebi = EXCLUDED.takim_cebi, okundu = EXCLUDED.okundu,
       durum_baslangic = CASE WHEN EXISTS (SELECT 1 FROM degisim) THEN EXCLUDED.durum_baslangic ELSE smartes_makine_durumu.durum_baslangic END`,
    [
      m.makineKodu, m.smartesMakineId, m.makineAdi, m.durum, m.durumKodu, m.mod, m.alarm, m.uyari, m.programNo, m.programAdi, m.sayac, m.sayacToplam,
      m.eksenHizi, m.eksenOrani, m.spindleYuku, m.spindleOrani, m.spindleHizi, m.takimCebi, zaman,
      m.durum === 'alarm' ? m.alarm?.slice(0, 400) ?? null : m.durum === 'bilinmiyor' ? m.durumKodu : null,
    ],
  );
}

export async function makineTuruYaz(
  db: Db, zaman: Date, t: { hata: string | null; okunan: number; makineSayisi: number; turSuresiMs: number },
): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_makine_okuma (son_deneme, son_sonuc, son_hata, son_basarili, okunan, makine_sayisi, tur_suresi_ms)
     VALUES ($1, CASE WHEN $2::text IS NULL THEN 'tamam' ELSE 'hata' END, $2, CASE WHEN $3 > 0 THEN $1::timestamptz END, $3, $4, $5)
     ON CONFLICT (tek) DO UPDATE SET son_deneme = EXCLUDED.son_deneme, son_sonuc = EXCLUDED.son_sonuc, son_hata = EXCLUDED.son_hata,
       son_basarili = COALESCE(EXCLUDED.son_basarili, smartes_makine_okuma.son_basarili), okunan = EXCLUDED.okunan,
       makine_sayisi = EXCLUDED.makine_sayisi, tur_suresi_ms = EXCLUDED.tur_suresi_ms`,
    [zaman, t.hata, t.okunan, t.makineSayisi, t.turSuresiMs],
  );
}

export interface MakineOkumaIzi { sonBasarili: string | null; sonHata: string | null; turSuresiMs: number; okunan: number; makineSayisi: number }

export function makineOkumaIzi(db: Db): Promise<MakineOkumaIzi | null> {
  return db.tek<MakineOkumaIzi>(
    `SELECT ${zamanMetni('son_basarili')} AS "sonBasarili", son_hata AS "sonHata", tur_suresi_ms AS "turSuresiMs", okunan,
            makine_sayisi AS "makineSayisi" FROM smartes_makine_okuma`,
  );
}

export interface MakineDurumSatiri {
  makineKodu: string;
  makineAdi: string | null;
  durum: MakineDurumu;
  durumKodu: string | null;
  durumBaslangic: string;
  mod: string | null;
  alarm: string | null;
  uyari: string | null;
  programNo: string | null;
  programAdi: string | null;
  sayac: number | null;
  sayacToplam: number | null;
  eksenHizi: number | null;
  eksenOrani: number | null;
  spindleYuku: number | null;
  spindleOrani: number | null;
  spindleHizi: number | null;
  takimCebi: number | null;
  okundu: string;
}

const MAKINE_SUTUNLARI = `makine_kodu AS "makineKodu", makine_adi AS "makineAdi", durum, durum_kodu AS "durumKodu",
  ${zamanMetni('durum_baslangic')} AS "durumBaslangic", mod, alarm, uyari, program_no AS "programNo", program_adi AS "programAdi", sayac,
  sayac_toplam AS "sayacToplam", eksen_hizi AS "eksenHizi", eksen_orani AS "eksenOrani", spindle_yuku AS "spindleYuku",
  spindle_orani AS "spindleOrani", spindle_hizi AS "spindleHizi", takim_cebi AS "takimCebi", ${zamanMetni('okundu')} AS okundu`;

export function makineDurumlari(db: Db, sinir: number): Promise<MakineDurumSatiri[]> {
  return db.sorgu<MakineDurumSatiri>(`SELECT ${MAKINE_SUTUNLARI} FROM smartes_makine_durumu ORDER BY makine_kodu LIMIT $1`, [sinir]);
}

export function makineDurumuGetir(db: Db, makineKodu: string): Promise<MakineDurumSatiri | null> {
  return db.tek<MakineDurumSatiri>(`SELECT ${MAKINE_SUTUNLARI} FROM smartes_makine_durumu WHERE makine_kodu = $1`, [makineKodu]);
}

export interface DurumDegisimSatiri { makineKodu: string; zaman: string; eski: MakineDurumu | null; yeni: MakineDurumu; aciklama: string | null }

// Gün başından beri değişimler ve makine başına gün başından önceki son değişim (gün başındaki durum ondan bilinir), zaman sırasıyla.
export function gunDegisimleri(db: Db, gunBasi: Date, makineKodu: string | null): Promise<(DurumDegisimSatiri & { onceki: boolean })[]> {
  return db.sorgu(
    `SELECT makine_kodu AS "makineKodu", ${zamanMetni('zaman')} AS zaman, eski, yeni, aciklama, onceki FROM (
       SELECT makine_kodu, zaman, eski, yeni, aciklama, id, false AS onceki FROM smartes_makine_durum_degisimi
        WHERE zaman >= $1 AND ($2::text IS NULL OR makine_kodu = $2)
       UNION ALL
       (SELECT DISTINCT ON (makine_kodu) makine_kodu, zaman, eski, yeni, aciklama, id, true FROM smartes_makine_durum_degisimi
         WHERE zaman < $1 AND ($2::text IS NULL OR makine_kodu = $2) ORDER BY makine_kodu, zaman DESC, id DESC)
     ) d ORDER BY makine_kodu, zaman, id`,
    [gunBasi, makineKodu],
  );
}

export async function ilerlemeYaz(db: Db, kayitlar: readonly IlerlemeKaydi[], zaman: Date): Promise<void> {
  const gelen = kayitlar.map((k) => ({ is_emri_no: k.isEmriNo, tamamlanan_yuzde: k.tamamlananYuzde, tahmini_bitis: k.tahminiBitis }));
  await db.sorgu(
    `WITH yazilan AS (
       INSERT INTO smartes_is_emri_ilerleme (is_emri_no, tamamlanan_yuzde, tahmini_bitis, okundu)
       SELECT is_emri_no, tamamlanan_yuzde, tahmini_bitis, $2 FROM jsonb_to_recordset($1::jsonb) AS x(is_emri_no text, tamamlanan_yuzde numeric, tahmini_bitis timestamptz)
       ON CONFLICT (is_emri_no) DO UPDATE SET tamamlanan_yuzde = EXCLUDED.tamamlanan_yuzde, tahmini_bitis = EXCLUDED.tahmini_bitis, okundu = EXCLUDED.okundu
       RETURNING 1
     )
     INSERT INTO smartes_ilerleme_okuma (son_deneme, son_sonuc, son_hata, son_basarili) VALUES ($2, 'tamam', NULL, $2)
     ON CONFLICT (tek) DO UPDATE SET son_deneme = EXCLUDED.son_deneme, son_sonuc = 'tamam', son_hata = NULL, son_basarili = EXCLUDED.son_basarili`,
    [JSON.stringify(gelen), zaman],
  );
}

export async function ilerlemeHatali(db: Db, zaman: Date, hata: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_ilerleme_okuma (son_deneme, son_sonuc, son_hata) VALUES ($1, 'hata', $2)
     ON CONFLICT (tek) DO UPDATE SET son_deneme = EXCLUDED.son_deneme, son_sonuc = 'hata', son_hata = EXCLUDED.son_hata`,
    [zaman, hata],
  );
}

export function ilerlemeOkumasi(db: Db): Promise<{ sonDeneme: Date } | null> {
  return db.tek<{ sonDeneme: Date }>('SELECT son_deneme AS "sonDeneme" FROM smartes_ilerleme_okuma');
}

export function ilerlemeler(db: Db, isEmriNolari: readonly string[]): Promise<{ isEmriNo: string; tamamlananYuzde: number | null; tahminiBitis: string | null }[]> {
  return db.sorgu(
    `SELECT is_emri_no AS "isEmriNo", tamamlanan_yuzde::float8 AS "tamamlananYuzde", ${zamanMetni('tahmini_bitis')} AS "tahminiBitis"
       FROM smartes_is_emri_ilerleme WHERE is_emri_no = ANY($1::text[])`,
    [[...isEmriNolari]],
  );
}

/* ---------------- Makine bulguları (kart 3192): yalnız okur; örnek tablosu okuma turunda yazılır ---------------- */

// Her başarılı makine okumasının izi; satır silinmez (3200 c: süresiz saklanır).
export async function ornekYaz(db: Db, m: MakineOkumasi, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_makine_ornegi (makine_kodu, zaman, durum, sayac, sayac_toplam, eksen_orani, spindle_yuku, takim_cebi, program_no)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [m.makineKodu, zaman, m.durum, m.sayac, m.sayacToplam, m.eksenOrani, m.spindleYuku, m.takimCebi, m.programNo?.slice(0, 200) ?? null],
  );
}

export interface OrnekSatiri { zaman: string; sayac: number | null; sayacToplam: number | null }

export function ornekler(db: Db, makineKodu: string, bas: Date, son: Date): Promise<OrnekSatiri[]> {
  return db.sorgu<OrnekSatiri>(
    `SELECT ${zamanMetni('zaman')} AS zaman, sayac, sayac_toplam AS "sayacToplam" FROM smartes_makine_ornegi
      WHERE makine_kodu = $1 AND zaman >= $2 AND zaman <= $3 ORDER BY zaman, id`,
    [makineKodu, bas, son],
  );
}

export interface DurusAraligi { makineKodu: string; nedenKodu: string | null; baslangic: string; bitis: string | null }

// Pencereyle kesişen SmartES duruş kayıtları (bitmemiş dahil).
export function durusAraliklari(db: Db, bas: Date, son: Date): Promise<DurusAraligi[]> {
  return db.sorgu<DurusAraligi>(
    `SELECT makine_kodu AS "makineKodu", neden_kodu AS "nedenKodu", ${zamanMetni('baslangic')} AS baslangic, ${zamanMetni('bitis')} AS bitis
       FROM smartes_durus
      WHERE makine_kodu IS NOT NULL AND baslangic IS NOT NULL AND baslangic < $2 AND (bitis IS NULL OR bitis > $1)
      ORDER BY makine_kodu, baslangic, smartes_id`,
    [bas, son],
  );
}

export interface SayimSatiri {
  isEmriNo: string | null; makineKodu: string; saglam: number | null; red: number | null; makineSaglam: number | null; makineRed: number | null; sonOkuma: string;
}

// Pencerede okunmuş iş emri durumları (makine kodu olanlar).
export function gunSayimlari(db: Db, bas: Date): Promise<SayimSatiri[]> {
  return db.sorgu<SayimSatiri>(
    `SELECT is_emri_no AS "isEmriNo", makine_kodu AS "makineKodu", saglam, red, makine_saglam AS "makineSaglam", makine_red AS "makineRed",
            ${zamanMetni('son_okuma')} AS "sonOkuma"
       FROM smartes_is_emri_durumu WHERE makine_kodu IS NOT NULL AND son_okuma >= $1 ORDER BY makine_kodu, smartes_id`,
    [bas],
  );
}

export interface AlarmTekrari { makineKodu: string; alarmKodu: string; aciklama: string | null; gunler: string[]; son: string }

// Makine ve alarm numarası başına pencerede gelen alarmlar; günler tesis saatine göre değil başlangıç anına göre listelenir (ekran biçimler).
export function alarmTekrarlari(db: Db, bas: Date): Promise<AlarmTekrari[]> {
  return db.sorgu<AlarmTekrari>(
    `SELECT makine_kodu AS "makineKodu", alarm_kodu AS "alarmKodu", max(aciklama) AS aciklama,
            array_agg(${zamanMetni('baslangic')} ORDER BY baslangic) AS gunler, ${zamanMetni('max(baslangic)')} AS son
       FROM smartes_alarm
      WHERE makine_kodu IS NOT NULL AND alarm_kodu IS NOT NULL AND baslangic >= $1
      GROUP BY makine_kodu, alarm_kodu ORDER BY makine_kodu, alarm_kodu`,
    [bas],
  );
}

export function gidenNolari(db: Db, nolar: readonly string[]): Promise<{ isEmriId: number; no: string }[]> {
  return db.sorgu(
    'SELECT is_emri_id AS "isEmriId", smartes_is_emri_no AS no FROM smartes_giden WHERE smartes_is_emri_no = ANY($1::text[])',
    [[...nolar]],
  );
}

export function butunIlerlemeler(db: Db): Promise<{ isEmriNo: string; tamamlananYuzde: number | null; tahminiBitis: string | null }[]> {
  return db.sorgu(
    `SELECT is_emri_no AS "isEmriNo", tamamlanan_yuzde::float8 AS "tamamlananYuzde", ${zamanMetni('tahmini_bitis')} AS "tahminiBitis"
       FROM smartes_is_emri_ilerleme WHERE tahmini_bitis IS NOT NULL AND (tamamlanan_yuzde IS NULL OR tamamlanan_yuzde < 100)`,
  );
}

/* ---------------- SmartES listeleri ve ad eşlemesi (3174) ---------------- */

export interface ListeSatiri {
  anahtar: string;
  smartesId: number | null;
  kod: string | null;
  ad: string | null;
  grup: string | null;
  operatorKaynakli: boolean | null;
  pasif: boolean | null;
  var: boolean;
  ilkGorulme: Date;
}

export function listeSatirlari(db: Db, tur: ListeTuru): Promise<ListeSatiri[]> {
  return db.sorgu<ListeSatiri>(
    `SELECT anahtar, smartes_id AS "smartesId", kod, ad, grup, operator_kaynakli AS "operatorKaynakli", pasif, var, ilk_gorulme AS "ilkGorulme"
     FROM smartes_liste_kaydi WHERE tur = $1 ORDER BY COALESCE(kod, ad), anahtar`,
    [tur],
  );
}

export interface ListeOkumasi {
  sonDeneme: Date;
  sonSonuc: 'tamam' | 'hata';
  sonHata: string | null;
  ilkBasarili: Date | null;
  sonBasarili: Date | null;
}

export function listeOkumasi(db: Db, tur: ListeTuru): Promise<ListeOkumasi | null> {
  return db.tek<ListeOkumasi>(
    `SELECT son_deneme AS "sonDeneme", son_sonuc AS "sonSonuc", son_hata AS "sonHata", ilk_basarili AS "ilkBasarili", son_basarili AS "sonBasarili"
     FROM smartes_liste_okuma WHERE tur = $1`,
    [tur],
  );
}

// Tek deyim: transaction dışından çağrılsa da liste, "artık yok" işareti ve okuma izi birlikte yazılır. Boş gelen liste kimseyi
// "yok" yapmaz: yanlış süzgeç ya da boş cevap bütün eşlemeleri uyarıya düşürmesin.
export async function listeYaz(db: Db, tur: ListeTuru, kayitlar: readonly ListeKaydi[], zaman: Date): Promise<void> {
  const gelen = kayitlar.map((k) => ({
    anahtar: k.anahtar, smartes_id: k.smartesId, kod: k.kod, ad: k.ad, grup: k.grup, operator_kaynakli: k.operatorKaynakli, pasif: k.pasif, ham: k.ham,
  }));
  await db.sorgu(
    `WITH gelen AS (
       SELECT * FROM jsonb_to_recordset($2::jsonb)
         AS x(anahtar text, smartes_id bigint, kod text, ad text, grup text, operator_kaynakli boolean, pasif boolean, ham jsonb)
     ), yazilan AS (
       INSERT INTO smartes_liste_kaydi (tur, anahtar, smartes_id, kod, ad, grup, operator_kaynakli, pasif, var, ham, ilk_gorulme, son_gorulme)
       SELECT $1, anahtar, smartes_id, kod, ad, grup, operator_kaynakli, pasif, true, ham, $3, $3 FROM gelen
       ON CONFLICT (tur, anahtar) DO UPDATE SET smartes_id = EXCLUDED.smartes_id, kod = EXCLUDED.kod, ad = EXCLUDED.ad, grup = EXCLUDED.grup,
         operator_kaynakli = EXCLUDED.operator_kaynakli, pasif = EXCLUDED.pasif, var = true, ham = EXCLUDED.ham, son_gorulme = EXCLUDED.son_gorulme
       RETURNING 1
     ), kalkan AS (
       UPDATE smartes_liste_kaydi SET var = false
       WHERE tur = $1 AND var AND EXISTS (SELECT 1 FROM gelen) AND anahtar NOT IN (SELECT anahtar FROM gelen)
       RETURNING 1
     )
     INSERT INTO smartes_liste_okuma (tur, son_deneme, son_sonuc, son_hata, ilk_basarili, son_basarili, okunan)
     VALUES ($1, $3, 'tamam', NULL, $3, $3, $4)
     ON CONFLICT (tur) DO UPDATE SET son_deneme = EXCLUDED.son_deneme, son_sonuc = 'tamam', son_hata = NULL,
       ilk_basarili = COALESCE(smartes_liste_okuma.ilk_basarili, EXCLUDED.ilk_basarili), son_basarili = EXCLUDED.son_basarili, okunan = EXCLUDED.okunan`,
    [tur, JSON.stringify(gelen), zaman, kayitlar.length],
  );
}

// Okunamayan liste eski haliyle kalır; yalnız iz yazılır.
export async function listeHatali(db: Db, tur: ListeTuru, zaman: Date, hata: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_liste_okuma (tur, son_deneme, son_sonuc, son_hata) VALUES ($1, $2, 'hata', $3)
     ON CONFLICT (tur) DO UPDATE SET son_deneme = EXCLUDED.son_deneme, son_sonuc = 'hata', son_hata = EXCLUDED.son_hata`,
    [tur, zaman, hata],
  );
}

export type AdTuru = 'fire' | 'durus';

export interface AdEslemeSatiri {
  anahtar: string;
  ad: string;
  nedenId: number;
  sonuc: 'hatali' | 'hurda' | null;
  surum: number;
}

const AD_ESLEME_ALANLARI = 'anahtar, ad, neden_id AS "nedenId", sonuc, surum';

export function adEslemeleri(db: Db, tur: AdTuru): Promise<AdEslemeSatiri[]> {
  return db.sorgu<AdEslemeSatiri>(`SELECT ${AD_ESLEME_ALANLARI} FROM smartes_ad_esleme WHERE tur = $1 ORDER BY anahtar`, [tur]);
}

export function adEslemeKilitle(db: Db, tur: AdTuru, anahtar: string): Promise<AdEslemeSatiri | null> {
  return db.tek<AdEslemeSatiri>(`SELECT ${AD_ESLEME_ALANLARI} FROM smartes_ad_esleme WHERE tur = $1 AND anahtar = $2 FOR UPDATE`, [tur, anahtar]);
}

export interface AdEslemeYazisi {
  tur: AdTuru;
  anahtar: string;
  ad: string;
  nedenId: number;
  sonuc: 'hatali' | 'hurda' | null;
  kisiId: number;
}

// Eklenemediyse (o arada başkası eklemiş) 0.
export async function adEslemeEkle(db: Db, y: AdEslemeYazisi): Promise<number> {
  const r = await db.tek<{ surum: number }>(
    `INSERT INTO smartes_ad_esleme (tur, anahtar, ad, neden_id, sonuc, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tur, anahtar) DO NOTHING RETURNING surum`,
    [y.tur, y.anahtar, y.ad, y.nedenId, y.sonuc, y.kisiId],
  );
  return r?.surum ?? 0;
}

// Neden ve sonuç değişmediyse satıra yazılmaz, sürüm artmaz; sürüm yine denetlenir.
export async function adEslemeGuncelle(db: Db, y: AdEslemeYazisi, surum: number): Promise<number | null> {
  const r = await db.tek<{ surum: number | null }>(
    `WITH hedef AS (
       SELECT surum, neden_id, sonuc FROM smartes_ad_esleme WHERE tur = $1 AND anahtar = $2 AND surum = $7 FOR UPDATE
     ), guncel AS (
       UPDATE smartes_ad_esleme e SET ad = $3, neden_id = $4, sonuc = $5, guncelleyen_kisi_id = $6, guncelleme = now(), surum = e.surum + 1
       FROM hedef WHERE e.tur = $1 AND e.anahtar = $2 AND (hedef.neden_id <> $4 OR hedef.sonuc IS DISTINCT FROM $5) RETURNING e.surum
     )
     SELECT COALESCE((SELECT surum FROM guncel), (SELECT surum FROM hedef)) AS surum`,
    [y.tur, y.anahtar, y.ad, y.nedenId, y.sonuc, y.kisiId, surum],
  );
  return r?.surum ?? null;
}

export async function adEslemeSil(db: Db, tur: AdTuru, anahtar: string, surum: number): Promise<boolean> {
  const r = await db.sorgu('DELETE FROM smartes_ad_esleme WHERE tur = $1 AND anahtar = $2 AND surum = $3 RETURNING 1', [tur, anahtar, surum]);
  return r.length > 0;
}

export interface OkunanAd {
  ad: string;
  sayi: number;
  ilk: string | null;
}

// Okunan fire ve duruş kayıtlarının ada göre sayısı ve en eski zamanı. Kayıt adla gelir (REJECT_NAME, DOWNTIME_NAME).
export function okunanAdlar(db: Db, tur: AdTuru): Promise<OkunanAd[]> {
  const [tablo, zaman] = tur === 'fire' ? ['smartes_red', 'zaman'] : ['smartes_durus', 'baslangic'];
  return db.sorgu<OkunanAd>(
    `SELECT neden_kodu AS ad, count(*)::int AS sayi, ${zamanMetni(`min(${zaman})`)} AS ilk
     FROM ${tablo} WHERE neden_kodu IS NOT NULL GROUP BY neden_kodu ORDER BY neden_kodu`,
  );
}

// Menüdeki sayı: eşlenmiş olup SmartES listesinden çıkan ve ilk listeden sonra gelip eşlenmemiş fire ve duruş adları.
export async function degisenAdSayisi(db: Db): Promise<number> {
  const r = await db.tek<{ n: number }>(
    `SELECT count(*)::int AS n
     FROM smartes_liste_kaydi k
     JOIN smartes_liste_okuma o ON o.tur = k.tur
     LEFT JOIN smartes_ad_esleme e ON e.tur = k.tur AND e.anahtar = k.anahtar
     WHERE k.tur IN ('fire', 'durus')
       AND ((e.anahtar IS NOT NULL AND NOT k.var)
         OR (e.anahtar IS NULL AND k.var AND k.pasif IS DISTINCT FROM true AND k.ilk_gorulme > o.ilk_basarili))`,
  );
  return r?.n ?? 0;
}

/* ---------------- gelen bilgiler: fire, ambar, kalite listeleri ve ham kayıt ---------------- */

export function redSay(db: Db): Promise<number> {
  return db.tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_red').then((r) => r?.n ?? 0);
}

// Fire adı hareket satırında gelir (neden_kodu); ayrı açıklama geldiyse o gösterilir.
export function redSatirlari<T>(db: Db, d: Dilim): Promise<T[]> {
  return db.sorgu<T>(
    `SELECT smartes_id AS "smartesId", is_emri_no AS "isEmriNo", stok_no AS "stokNo", istasyon_kodu AS "istasyonKodu", makine_kodu AS "makineKodu",
       adet, COALESCE(neden, neden_kodu) AS neden, ${zamanMetni('zaman')} AS zaman
     FROM smartes_red ORDER BY zaman DESC NULLS LAST, smartes_id DESC LIMIT $1 OFFSET $2`,
    [d.sinir, d.atla],
  );
}

export function ambarSay(db: Db): Promise<number> {
  return db.tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_ambar_hareketi').then((r) => r?.n ?? 0);
}

export function ambarSatirlari<T>(db: Db, d: Dilim): Promise<T[]> {
  return db.sorgu<T>(
    `SELECT smartes_id AS "smartesId", is_emri_no AS "isEmriNo", stok_no AS "stokNo", ambar_kodu AS "ambarKodu", hareket_turu AS "hareketTuru",
       miktar::float8 AS miktar, ${zamanMetni('zaman')} AS zaman
     FROM smartes_ambar_hareketi ORDER BY zaman DESC NULLS LAST, smartes_id DESC LIMIT $1 OFFSET $2`,
    [d.sinir, d.atla],
  );
}

export function kaliteSay(db: Db): Promise<number> {
  return db.tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_kalite_kontrol').then((r) => r?.n ?? 0);
}

export function kaliteSatirlari<T>(db: Db, d: Dilim): Promise<T[]> {
  return db.sorgu<T>(
    `SELECT smartes_id AS "smartesId", is_emri_no AS "isEmriNo", stok_no AS "stokNo", istasyon_kodu AS "istasyonKodu", makine_kodu AS "makineKodu",
       olcum_adi AS "olcumAdi", olcum_degeri AS "olcumDegeri", sonuc, ${zamanMetni('zaman')} AS zaman
     FROM smartes_kalite_kontrol ORDER BY zaman DESC NULLS LAST, smartes_id DESC LIMIT $1 OFFSET $2`,
    [d.sinir, d.atla],
  );
}

const HAM_TABLOLARI = {
  uretim: 'smartes_is_emri_durumu', durus: 'smartes_durus', alarm: 'smartes_alarm',
  fire: 'smartes_red', ambar: 'smartes_ambar_hareketi', kalite: 'smartes_kalite_kontrol',
} as const;
export type HamTuru = keyof typeof HAM_TABLOLARI;

export function hamKayit(db: Db, tur: HamTuru, smartesId: number): Promise<Record<string, unknown> | null> {
  return db.tek<{ ham: Record<string, unknown> }>(`SELECT ham FROM ${HAM_TABLOLARI[tur]} WHERE smartes_id = $1`, [smartesId]).then((r) => r?.ham ?? null);
}

export interface GelenIzi {
  kaynak: string;
  sonOkuma: string | null;
}

// Her okumanın son başarılı zamanı: akış izinde son deneme başarılıysa o, değilse en son tamamlanan pencerenin sonu; listede son başarılı okuma.
export function gelenIzleri(db: Db): Promise<GelenIzi[]> {
  return db.sorgu<GelenIzi>(
    `SELECT kaynak, ${zamanMetni('CASE WHEN son_sonuc = \'tamam\' THEN son_deneme ELSE son_bitis END')} AS "sonOkuma" FROM smartes_okuma
     UNION ALL
     SELECT akis, ${zamanMetni('CASE WHEN son_sonuc = \'tamam\' THEN son_deneme ELSE son_bitis END')} FROM smartes_akis_izi WHERE akis <> 'tanim'
     UNION ALL
     SELECT 'liste:' || tur, ${zamanMetni('son_basarili')} FROM smartes_liste_okuma
     UNION ALL
     SELECT 'hesap:' || tur, ${zamanMetni('son_basarili')} FROM smartes_hesap_okuma`,
  );
}

export interface ListeSayisi {
  tur: ListeTuru;
  n: number;
}

export function listeSayilari(db: Db): Promise<ListeSayisi[]> {
  return db.sorgu<ListeSayisi>('SELECT tur, count(*)::int AS n FROM smartes_liste_kaydi WHERE var GROUP BY tur');
}

/* ---------------- SmartES'in kendi hesapları: OEE raporu ve parça çevrim süresi ---------------- */

export function hesapOkumasi(db: Db, tur: HesapTuru): Promise<{ sonDeneme: Date } | null> {
  return db.tek<{ sonDeneme: Date }>('SELECT son_deneme AS "sonDeneme" FROM smartes_hesap_okuma WHERE tur = $1', [tur]);
}

const HESAP_IZI = `INSERT INTO smartes_hesap_okuma (tur, son_deneme, son_sonuc, son_hata, son_basarili, okunan) VALUES ($1, $3, 'tamam', NULL, $3, $4)
     ON CONFLICT (tur) DO UPDATE SET son_deneme = EXCLUDED.son_deneme, son_sonuc = 'tamam', son_hata = NULL, son_basarili = EXCLUDED.son_basarili,
       okunan = EXCLUDED.okunan`;

// Tek deyim: transaction dışından çağrılsa da satırlar ve okuma izi birlikte yazılır.
export async function oeeYaz(db: Db, kayitlar: readonly OeeKaydi[], zaman: Date): Promise<void> {
  const gelen = kayitlar.map((k) => ({
    vardiya_tarihi: k.vardiyaTarihi, vardiya: k.vardiya, makine_kodu: k.makineKodu, kullanilabilirlik: k.kullanilabilirlik, performans: k.performans,
    kalite: k.kalite, oee: k.oee, ham: k.ham,
  }));
  await db.sorgu(
    `WITH yazilan AS (
       INSERT INTO smartes_oee (vardiya_tarihi, vardiya, makine_kodu, kullanilabilirlik, performans, kalite, oee, ham, ilk_okuma, son_okuma)
       SELECT vardiya_tarihi, vardiya, makine_kodu, kullanilabilirlik, performans, kalite, oee, ham, $3, $3 FROM jsonb_to_recordset($2::jsonb)
         AS x(vardiya_tarihi date, vardiya int, makine_kodu text, kullanilabilirlik numeric, performans numeric, kalite numeric, oee numeric, ham jsonb)
       ON CONFLICT (vardiya_tarihi, vardiya, makine_kodu) DO UPDATE SET kullanilabilirlik = EXCLUDED.kullanilabilirlik, performans = EXCLUDED.performans,
         kalite = EXCLUDED.kalite, oee = EXCLUDED.oee, ham = EXCLUDED.ham, son_okuma = EXCLUDED.son_okuma
       RETURNING 1
     )
     ${HESAP_IZI}`,
    ['oee', JSON.stringify(gelen), zaman, kayitlar.length],
  );
}

export async function cevrimYaz(db: Db, kayitlar: readonly CevrimKaydi[], zaman: Date): Promise<void> {
  const gelen = kayitlar.map((k) => ({
    anahtar: k.anahtar, stok_no: k.stokNo, operasyon_kodu: k.operasyonKodu, makine_kodu: k.makineKodu, istasyon_kodu: k.istasyonKodu,
    cevrim_metni: k.cevrimMetni, yukleme_metni: k.yuklemeMetni, parca_sayisi: k.parcaSayisi, gun_sayisi: k.gunSayisi, ham: k.ham,
  }));
  await db.sorgu(
    `WITH yazilan AS (
       INSERT INTO smartes_cevrim_suresi (anahtar, stok_no, operasyon_kodu, makine_kodu, istasyon_kodu, cevrim_metni, yukleme_metni, parca_sayisi,
         gun_sayisi, ham, ilk_okuma, son_okuma)
       SELECT anahtar, stok_no, operasyon_kodu, makine_kodu, istasyon_kodu, cevrim_metni, yukleme_metni, parca_sayisi, gun_sayisi, ham, $3, $3
       FROM jsonb_to_recordset($2::jsonb) AS x(anahtar text, stok_no text, operasyon_kodu text, makine_kodu text, istasyon_kodu text, cevrim_metni text,
         yukleme_metni text, parca_sayisi int, gun_sayisi int, ham jsonb)
       ON CONFLICT (anahtar) DO UPDATE SET cevrim_metni = EXCLUDED.cevrim_metni, yukleme_metni = EXCLUDED.yukleme_metni,
         parca_sayisi = EXCLUDED.parca_sayisi, gun_sayisi = EXCLUDED.gun_sayisi, ham = EXCLUDED.ham, son_okuma = EXCLUDED.son_okuma
       RETURNING 1
     )
     ${HESAP_IZI}`,
    ['cevrim', JSON.stringify(gelen), zaman, kayitlar.length],
  );
}

export async function hesapHatali(db: Db, tur: HesapTuru, zaman: Date, hata: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO smartes_hesap_okuma (tur, son_deneme, son_sonuc, son_hata) VALUES ($1, $2, 'hata', $3)
     ON CONFLICT (tur) DO UPDATE SET son_deneme = EXCLUDED.son_deneme, son_sonuc = 'hata', son_hata = EXCLUDED.son_hata`,
    [tur, zaman, hata],
  );
}

export interface OeeSatiri {
  vardiyaTarihi: string;
  vardiya: number;
  makineKodu: string;
  kullanilabilirlik: number | null;
  performans: number | null;
  kalite: number | null;
  oee: number | null;
}

export function oeeSatirlari(db: Db, ilkGun: string, sinir: number): Promise<OeeSatiri[]> {
  return db.sorgu<OeeSatiri>(
    `SELECT vardiya_tarihi::text AS "vardiyaTarihi", vardiya, makine_kodu AS "makineKodu", kullanilabilirlik::float8 AS kullanilabilirlik,
       performans::float8 AS performans, kalite::float8 AS kalite, oee::float8 AS oee
     FROM smartes_oee WHERE vardiya_tarihi >= $1::date ORDER BY vardiya_tarihi DESC, vardiya DESC, makine_kodu LIMIT $2`,
    [ilkGun, sinir],
  );
}

export interface CevrimSatiri {
  stokNo: string | null;
  operasyonKodu: string | null;
  makineKodu: string | null;
  cevrimMetni: string | null;
  parcaSayisi: number | null;
  gunSayisi: number | null;
}

export function cevrimSatirlari(db: Db, sinir: number): Promise<CevrimSatiri[]> {
  return db.sorgu<CevrimSatiri>(
    `SELECT stok_no AS "stokNo", operasyon_kodu AS "operasyonKodu", makine_kodu AS "makineKodu", cevrim_metni AS "cevrimMetni",
       parca_sayisi AS "parcaSayisi", gun_sayisi AS "gunSayisi"
     FROM smartes_cevrim_suresi ORDER BY stok_no NULLS LAST, operasyon_kodu NULLS LAST, makine_kodu NULLS LAST, anahtar LIMIT $1`,
    [sinir],
  );
}

export async function hesapSayilari(db: Db): Promise<{ oee: number; cevrim: number }> {
  const r = await db.tek<{ oee: number; cevrim: number }>(
    'SELECT (SELECT count(*) FROM smartes_oee)::int AS oee, (SELECT count(*) FROM smartes_cevrim_suresi)::int AS cevrim');
  if (r === null) throw new Error('Sayılar okunamadı.');
  return r;
}

/* ---------------- Adet onayı (3173 b, 3193 a) ---------------- */

export interface OnayToplamSatiri { tur: 'saglam' | 'red'; toplam: number; satir: number }

// Satırın kuyruğa girmiş bütün adetleri (reddedilen dahil): fark bunun üstünden hesaplanır.
export function onayToplamlari(db: Db, smartesId: number): Promise<OnayToplamSatiri[]> {
  return db.sorgu<OnayToplamSatiri>(
    `SELECT tur, sum(adet)::int AS toplam, count(*)::int AS satir FROM smartes_adet_onayi WHERE smartes_id = $1 GROUP BY tur`,
    [smartesId],
  );
}

export async function onaySatiriEkle(db: Db, y: { smartesId: number; tur: 'saglam' | 'red'; adet: number; duzeltme: boolean; zaman: Date }): Promise<void> {
  await db.sorgu(
    'INSERT INTO smartes_adet_onayi (smartes_id, tur, adet, duzeltme, olusma) VALUES ($1, $2, $3, $4, $5)',
    [y.smartesId, y.tur, y.adet, y.duzeltme, y.zaman],
  );
}

// SmartES iş emri no'su giden kutusunda tekil değildir: yalnız tek CORE iş emrine çıkan no eşleşmiş sayılır, birden çoğu eşleşmemiş
// gibi görünür ve onaylanamaz (yanlış emre sayım ve stok yazılmasın).
const TEK_GIDEN = `LEFT JOIN LATERAL (SELECT CASE WHEN count(*) = 1 THEN min(x.is_emri_id) END AS is_emri_id
                    FROM smartes_giden x WHERE x.smartes_is_emri_no = d.is_emri_no) g ON true`;

export interface KilitliOnaySatiri {
  id: number;
  tur: 'saglam' | 'red';
  adet: number;
  durum: 'bekliyor' | 'onaylandi' | 'reddedildi';
  isEmriId: number | null;
  makineKodu: string | null;
}

// Onay ve red aynı satırı iki kez işlemesin diye satır kilitlenir. SmartES iş emri no'su giden kutusundaki karşılığıyla CORE iş emrine bağlanır.
export function onaySatiriKilitle(db: Db, id: number): Promise<KilitliOnaySatiri | null> {
  return db.tek<KilitliOnaySatiri>(
    `SELECT o.id::int AS id, o.tur, o.adet, o.durum, g.is_emri_id AS "isEmriId", d.makine_kodu AS "makineKodu"
       FROM smartes_adet_onayi o
       JOIN smartes_is_emri_durumu d ON d.smartes_id = o.smartes_id
       ${TEK_GIDEN}
      WHERE o.id = $1
      FOR UPDATE OF o`,
    [id],
  );
}

export async function onayKarariYaz(
  db: Db, id: number, k: { durum: 'onaylandi' | 'reddedildi'; kisiId: number; zaman: string; redNedeni: string | null },
): Promise<boolean> {
  const r = await db.tek<{ id: number }>(
    `UPDATE smartes_adet_onayi SET durum = $2, karar_veren_kisi_id = $3, karar_zamani = $4::timestamptz, red_nedeni = $5
      WHERE id = $1 AND durum = 'bekliyor' RETURNING id::int AS id`,
    [id, k.durum, k.kisiId, k.zaman, k.redNedeni],
  );
  return r !== null;
}

export function bekleyenOnaySay(db: Db): Promise<number> {
  return db.tek<{ n: number }>("SELECT count(*)::int AS n FROM smartes_adet_onayi WHERE durum = 'bekliyor'").then((r) => r?.n ?? 0);
}

export interface OnayListeSatiri {
  id: number;
  smartesId: number;
  tur: 'saglam' | 'red';
  adet: number;
  duzeltme: boolean;
  durum: 'bekliyor' | 'onaylandi' | 'reddedildi';
  olusma: string;
  isEmriNo: string | null;
  isEmriId: number | null;
  smartesSaglam: number | null;
  makineSaglam: number | null;
  istasyonKodu: string | null;
  makineKodu: string | null;
  baslangic: string | null;
  kararVerenKisiId: number | null;
  kararZamani: string | null;
  redNedeni: string | null;
}

const ONAY_SECIMI = `SELECT o.id::int AS id, o.smartes_id AS "smartesId", o.tur, o.adet, o.duzeltme, o.durum, ${zamanMetni('o.olusma')} AS olusma,
       d.is_emri_no AS "isEmriNo", g.is_emri_id AS "isEmriId", d.saglam AS "smartesSaglam", d.makine_saglam AS "makineSaglam", d.istasyon_kodu AS "istasyonKodu", d.makine_kodu AS "makineKodu",
       ${zamanMetni('d.baslangic')} AS baslangic, o.karar_veren_kisi_id AS "kararVerenKisiId", ${zamanMetni('o.karar_zamani')} AS "kararZamani",
       o.red_nedeni AS "redNedeni"
     FROM smartes_adet_onayi o
     JOIN smartes_is_emri_durumu d ON d.smartes_id = o.smartes_id
     ${TEK_GIDEN}`;

export function onaySay(db: Db, durum: 'bekliyor' | 'karar'): Promise<number> {
  return db.tek<{ n: number }>(
    `SELECT count(*)::int AS n FROM smartes_adet_onayi WHERE ${durum === 'bekliyor' ? "durum = 'bekliyor'" : "durum <> 'bekliyor'"}`,
  ).then((r) => r?.n ?? 0);
}

// Bekleyen en eskiden, karar verilmiş en yeniden.
export function onaySatirlari(db: Db, durum: 'bekliyor' | 'karar', d: Dilim): Promise<OnayListeSatiri[]> {
  return db.sorgu<OnayListeSatiri>(
    durum === 'bekliyor'
      ? `${ONAY_SECIMI} WHERE o.durum = 'bekliyor' ORDER BY o.id LIMIT $1 OFFSET $2`
      : `${ONAY_SECIMI} WHERE o.durum <> 'bekliyor' ORDER BY o.karar_zamani DESC, o.id DESC LIMIT $1 OFFSET $2`,
    [d.sinir, d.atla],
  );
}
