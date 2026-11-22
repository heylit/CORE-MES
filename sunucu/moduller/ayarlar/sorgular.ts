import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

export interface SaklananDeger {
  deger: unknown;
}

export function ayarDegeriniOku(db: Db, anahtar: string): Promise<SaklananDeger | null> {
  return db.tek<SaklananDeger>('SELECT deger FROM ayar WHERE anahtar = $1', [anahtar]);
}

// Değiştirme eski değeri okumadan önce anahtarı kilitler: aynı ayarı aynı anda değiştiren ikinci komut birincinin bitmesini
// bekler. Satır kilidi yetmez: hiç yazılmamış ayarda kilitlenecek satır yoktur.
export async function ayarKilitle(db: Db, anahtar: string): Promise<void> {
  await islemKilidiAl(db, `ayar-degistir-${anahtar}`);
}

export function ayarDegerleriniOku(db: Db): Promise<(SaklananDeger & { anahtar: string })[]> {
  return db.sorgu<SaklananDeger & { anahtar: string }>('SELECT anahtar, deger FROM ayar');
}

// Seçilen ayarların son değiştireni ve zamanı (Planlama ayarları sayfasının kontrol tablosu); hiç yazılmamış ayarın satırı yoktur.
export function ayarGuncellemeleriniOku(db: Db, anahtarlar: readonly string[]): Promise<{ anahtar: string; kisiId: number; zaman: string }[]> {
  return db.sorgu<{ anahtar: string; kisiId: number; zaman: string }>(
    `SELECT anahtar, guncelleyen_kisi_id AS "kisiId", ${zamanMetni('guncelleme')} AS zaman FROM ayar WHERE anahtar = ANY($1::text[])`, [anahtarlar]);
}

export async function ayarDegeriniYaz(db: Db, anahtar: string, deger: unknown, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (anahtar) DO UPDATE
       SET deger = EXCLUDED.deger, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncelleme = now()`,
    [anahtar, JSON.stringify(deger), kisiId],
  );
}

export async function ayarDegeriniSil(db: Db, anahtar: string): Promise<void> {
  await db.sorgu('DELETE FROM ayar WHERE anahtar = $1', [anahtar]);
}

// Yıl ve ay atölyenin saatiyle: gece yarısından sonra açılan kayıt yeni ayın numarasını alır.
export async function simdikiYilAy(db: Db): Promise<{ yil: number; ay: number }> {
  const satir = await db.tek<{ yil: number; ay: number }>(
    `SELECT extract(year FROM now() AT TIME ZONE 'Europe/Istanbul')::int AS yil, extract(month FROM now() AT TIME ZONE 'Europe/Istanbul')::int AS ay`,
  );
  if (satir === null) throw new Error('Saat okunamadı.');
  return satir;
}

// Kalıpta {FIRMA} yoksa firma boş metindir (''); varsa her firma kendi sırasını yürütür (3399 a).
export async function sayacArtir(db: Db, anahtar: string, donem: string, firmaKodu = ''): Promise<number> {
  const satir = await db.tek<{ sira: number }>(
    `INSERT INTO ayar_numara_sayaci (anahtar, donem, firma_kodu, son_sira) VALUES ($1, $2, $3, 1)
     ON CONFLICT (anahtar, donem, firma_kodu) DO UPDATE SET son_sira = ayar_numara_sayaci.son_sira + 1
     RETURNING son_sira AS sira`,
    [anahtar, donem, firmaKodu],
  );
  if (satir === null) throw new Error('Sayaç artırılamadı.');
  return satir.sira;
}

// Uzun dış işi bekleyen transaction'ın boşta sayılmaması için (gece yedeği, kart #1205).
export async function nabiz(db: Db): Promise<void> {
  await db.tek('SELECT 1');
}

export interface SunucuSurumu {
  surumNo: number | null;
  metin: string | null;
}

// Yedek aracının ana sürümü bununla karşılaştırılır (2306). current_setting süper kullanıcı istemez.
export async function sunucuSurumu(db: Db): Promise<SunucuSurumu> {
  const satir = await db.tek<{ surum_no: number | null; metin: string | null }>(
    `SELECT current_setting('server_version_num')::int AS surum_no, version() AS metin`,
  );
  return { surumNo: satir?.surum_no ?? null, metin: satir?.metin ?? null };
}

// Deneme verisi temizleme (3395 a). Kök tablolar başka modüllerindir: okuma, etki ve silme göç rolüne ait işlevlerdedir
// (sunucu/gocler/20261117122000_ayarlar_veri_temizleme.sql); burada yalnız işlev çağrılır ve işaret tablosu yazılır.
export interface TemizlikAdayiSatiri {
  kimlik: string;
  no: string;
  ad: string | null;
  acan: string;
  acilis: Date;
  durum: string;
  isaretli: boolean;
  toplam: string;
}

export function temizlikAdaylariniOku(
  db: Db, s: { tur: string; baslangic: string | null; bitis: string | null; kisi: number | null; yalnizIsaretli: boolean; sinir: number },
): Promise<TemizlikAdayiSatiri[]> {
  return db.sorgu<TemizlikAdayiSatiri>(
    'SELECT * FROM ayarlar_temizlik_adaylari($1, $2::date, $3::date, $4, $5, $6)',
    [s.tur, s.baslangic, s.bitis, s.kisi, s.yalnizIsaretli, s.sinir],
  );
}

export async function denemeIsaretle(db: Db, kokler: readonly { tur: string; kimlik: number }[], kisiId: number): Promise<number> {
  const satirlar = await db.sorgu<{ tur: string }>(
    `INSERT INTO ayarlar_deneme_isareti (tur, kimlik, isaretleyen_id)
     SELECT k.tur, k.kimlik, $2 FROM jsonb_to_recordset($1::jsonb) AS k(tur text, kimlik bigint)
     ON CONFLICT DO NOTHING RETURNING tur`,
    [JSON.stringify(kokler), kisiId],
  );
  return satirlar.length;
}

export async function denemeIsaretiniKaldir(db: Db, kokler: readonly { tur: string; kimlik: number }[]): Promise<number> {
  const satirlar = await db.sorgu<{ tur: string }>(
    `DELETE FROM ayarlar_deneme_isareti i USING jsonb_to_recordset($1::jsonb) AS k(tur text, kimlik bigint)
     WHERE i.tur = k.tur AND i.kimlik = k.kimlik RETURNING i.tur`,
    [JSON.stringify(kokler)],
  );
  return satirlar.length;
}

export interface TemizlikEtkisiSatiri {
  kokler: { tur: string; kimlik: number; no: string | null; kilitler: string[]; tablolar: Record<string, number> }[];
  tablolar: Record<string, number>;
  ozet: string;
}

// Kapsam ya açık seçimdir ya da tarih; tarih seçime veritabanı işlevinde çevrilir (dış sistem kilidi yalnız orada düşer).
export type TemizlikKapsamSatiri =
  | { secim: readonly { tur: string; kimlik: number }[] }
  | { tarih: { turler: readonly string[]; bitis: string }; sinir: number };

export async function temizlikEtkisiniOku(db: Db, kapsam: TemizlikKapsamSatiri): Promise<TemizlikEtkisiSatiri> {
  const satir = 'secim' in kapsam
    ? await db.tek<{ etki: TemizlikEtkisiSatiri }>('SELECT ayarlar_temizlik_etkisi($1::jsonb) - \'satirlar\' AS etki', [JSON.stringify(kapsam.secim)])
    : await db.tek<{ etki: TemizlikEtkisiSatiri }>('SELECT ayarlar_temizlik_etkisi_tarihle($1::text[], $2::date, $3) - \'satirlar\' AS etki',
      [kapsam.tarih.turler, kapsam.tarih.bitis, kapsam.sinir]);
  if (satir === null) throw new Error('Temizlik etkisi okunamadı');
  return satir.etki;
}

export interface TemizlikSonucuSatiri {
  tablolar: Record<string, number>;
  kokler: { tur: string; no: string | null }[];
}

export async function veriyiTemizle(db: Db, kapsam: TemizlikKapsamSatiri, ozet: string): Promise<TemizlikSonucuSatiri> {
  const satir = 'secim' in kapsam
    ? await db.tek<{ sonuc: TemizlikSonucuSatiri }>('SELECT ayarlar_veri_temizle($1::jsonb, $2) AS sonuc', [JSON.stringify(kapsam.secim), ozet])
    : await db.tek<{ sonuc: TemizlikSonucuSatiri }>('SELECT ayarlar_veri_temizle_tarihle($1::text[], $2::date, $3, $4) AS sonuc',
      [kapsam.tarih.turler, kapsam.tarih.bitis, kapsam.sinir, ozet]);
  if (satir === null) throw new Error('Temizlik sonucu okunamadı');
  return satir.sonuc;
}

export async function denemeIsaretleTarihle(db: Db, t: { turler: readonly string[]; bitis: string }, kisiId: number): Promise<number> {
  const satir = await db.tek<{ n: string }>('SELECT ayarlar_deneme_isaretle_tarihle($1::text[], $2::date, $3) AS n', [t.turler, t.bitis, kisiId]);
  return Number(satir?.n ?? 0);
}

export async function denemeIsaretiniKaldirTarihle(db: Db, t: { turler: readonly string[]; bitis: string }): Promise<number> {
  const satir = await db.tek<{ n: string }>('SELECT ayarlar_deneme_isareti_kaldir_tarihle($1::text[], $2::date) AS n', [t.turler, t.bitis]);
  return Number(satir?.n ?? 0);
}

export async function temizlikTarihSayisiniOku(db: Db, t: { turler: readonly string[]; bitis: string }): Promise<{ toplam: number; isaretli: number }> {
  const satir = await db.tek<{ toplam: string; isaretli: string }>('SELECT * FROM ayarlar_temizlik_tarih_sayisi($1::text[], $2::date)', [t.turler, t.bitis]);
  return { toplam: Number(satir?.toplam ?? 0), isaretli: Number(satir?.isaretli ?? 0) };
}

// Deneme işaretli kökler listelerden gizlenir (3395 madde 2); sahibi modül kimlikleri dışarı ithalle alır.
export async function denemeIsaretliKimlikleriOku(db: Db, tur: string): Promise<number[]> {
  const satirlar = await db.sorgu<{ kimlik: string }>('SELECT kimlik FROM ayarlar_deneme_isareti WHERE tur = $1', [tur]);
  return satirlar.map((s) => Number(s.kimlik));
}

export async function denemeIsaretiKalkmaAniniOku(db: Db, tur: string): Promise<string | null> {
  const satir = await db.tek<{ zaman: string }>(`SELECT ${zamanMetni('zaman')} AS zaman FROM ayarlar_deneme_isareti_kalkma WHERE tur = $1`, [tur]);
  return satir?.zaman ?? null;
}

// 3399 a: firma kodları. Kod sütunu güncellenmez; satır silinmez.
const FIRMA_KODU = 'id, kod, ad, varsayilan, aktif, surum';
export interface FirmaKoduSatiri { id: number; kod: string; ad: string; varsayilan: boolean; aktif: boolean; surum: number }

export function firmaKodlariniOku(db: Db): Promise<FirmaKoduSatiri[]> {
  return db.sorgu<FirmaKoduSatiri>(`SELECT ${FIRMA_KODU} FROM ayar_firma_kodu ORDER BY varsayilan DESC, aktif DESC, kod`);
}

export function firmaKoduOku(db: Db, kod: string): Promise<FirmaKoduSatiri | null> {
  return db.tek<FirmaKoduSatiri>(`SELECT ${FIRMA_KODU} FROM ayar_firma_kodu WHERE kod = $1`, [kod]);
}

export function firmaKoduIdIleOku(db: Db, id: number): Promise<FirmaKoduSatiri | null> {
  return db.tek<FirmaKoduSatiri>(`SELECT ${FIRMA_KODU} FROM ayar_firma_kodu WHERE id = $1`, [id]);
}

export async function varsayilanFirmaKoduOku(db: Db): Promise<string | null> {
  return (await db.tek<{ kod: string }>('SELECT kod FROM ayar_firma_kodu WHERE varsayilan'))?.kod ?? null;
}

// Yeni varsayılan yazılmadan önce eskisi düşer: tek varsayılan dizini aynı anda iki satırı kabul etmez.
export async function varsayilaniBirak(db: Db, haricId: number | null, kisiId: number): Promise<void> {
  await db.sorgu(
    `UPDATE ayar_firma_kodu SET varsayilan = false, surum = surum + 1, guncelleyen_kisi_id = $2, guncelleme = now()
      WHERE varsayilan AND ($1::int IS NULL OR id <> $1)`,
    [haricId, kisiId],
  );
}

export function firmaKoduEkle(db: Db, g: { kod: string; ad: string; varsayilan: boolean }, kisiId: number): Promise<FirmaKoduSatiri | null> {
  return db.tek<FirmaKoduSatiri>(
    `INSERT INTO ayar_firma_kodu (kod, ad, varsayilan, olusturan_kisi_id, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4, $4)
     RETURNING ${FIRMA_KODU}`,
    [g.kod, g.ad, g.varsayilan, kisiId],
  );
}

export function firmaKoduGuncelle(
  db: Db, id: number, g: { ad: string; varsayilan: boolean; aktif: boolean }, surum: number, kisiId: number,
): Promise<FirmaKoduSatiri | null> {
  return db.tek<FirmaKoduSatiri>(
    `UPDATE ayar_firma_kodu SET ad = $2, varsayilan = $3, aktif = $4, surum = surum + 1, guncelleyen_kisi_id = $6, guncelleme = now()
      WHERE id = $1 AND surum = $5 RETURNING ${FIRMA_KODU}`,
    [id, g.ad, g.varsayilan, g.aktif, surum, kisiId],
  );
}

// Listeyi değiştiren iki komut sırayla çalışır: varsayılanın bırakılıp yenisinin yazılması bölünmez.
export async function firmaKodlariniKilitle(db: Db): Promise<void> {
  await islemKilidiAl(db, 'ayar-firma-kodu');
}

export interface SifirlamaKapsamSatiri { kalan: readonly string[]; kismi: readonly string[]; kullanicilar: boolean; yoneticiId: number }

export async function sifirlamaSayilariniOku(db: Db, k: SifirlamaKapsamSatiri): Promise<Record<string, number>> {
  const satir = await db.tek<{ sayilar: Record<string, number> }>(
    'SELECT ayarlar_sifirlama_sayilari($1::text[], $2::text[], $3, $4) AS sayilar', [k.kalan, k.kismi, k.kullanicilar, k.yoneticiId]);
  return satir?.sayilar ?? {};
}

export async function sifirdanBaslat(db: Db, k: SifirlamaKapsamSatiri): Promise<{ tablolar: Record<string, number>; cozulen: Record<string, number> }> {
  const satir = await db.tek<{ sonuc: { tablolar: Record<string, number>; cozulen: Record<string, number> } }>(
    'SELECT ayarlar_sifirdan_basla($1::text[], $2::text[], $3, $4) AS sonuc', [k.kalan, k.kismi, k.kullanicilar, k.yoneticiId]);
  if (satir === null) throw new Error('Sıfırlama sonucu okunamadı');
  return satir.sonuc;
}
