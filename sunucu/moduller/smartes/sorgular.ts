import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type {
  AlarmKaydi, AmbarKaydi, DurusKaydi, EslemeTuru, IsEmriDurumuKaydi, KaliteKaydi, OkumaKaynagi, RedKaydi, TanimIzi, TanimKaydi, TanimTuru,
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

export async function eslemeGuncelle(db: Db, tur: EslemeTuru, tmiId: number, kod: string, kisiId: number, surum: number): Promise<number | null> {
  const r = await db.tek<{ surum: number }>(
    `UPDATE smartes_esleme SET smartes_kod = $3, guncelleyen_kisi_id = $4, guncelleme = now(), surum = surum + 1
     WHERE tur = $1 AND tmi_id = $2 AND surum = $5 RETURNING surum`,
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
