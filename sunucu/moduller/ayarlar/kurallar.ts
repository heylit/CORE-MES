import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { AYAR_TANIMLARI, varsayilanDeger } from '#paylasilan/ayarlar.ts';
import type { AyarAnahtari, AyarDegeri } from '#paylasilan/ayarlar.ts';
import {
  YEDEK_ADI, ayarDegerSemasi, guncellemeGecmisKaydi, guncellemeUygulamaIstegi, guncellemeUygulamaSonucu, type YedekTuru,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { zamanSemasi } from '#paylasilan/zaman.ts';

export type DegerSonucu<A extends AyarAnahtari> = { deger: AyarDegeri<A> } | { hata: string };

// Değer tanımın türüne ve sınırlarına uymalıdır; yazılan değerde de saklanan değerde de aynı ölçü kullanılır.
export function degeriDogrula<A extends AyarAnahtari>(anahtar: A, deger: unknown): DegerSonucu<A> {
  const sonuc = ayarDegerSemasi(AYAR_TANIMLARI[anahtar]).safeParse(deger);
  // Şema tanımın türünden kurulur; dönen değer o türün değeridir.
  if (sonuc.success) return { deger: sonuc.data as AyarDegeri<A> };
  return { hata: sonuc.error.issues[0]?.message ?? 'Değer geçersiz.' };
}

// Hiç yazılmamış ayar varsayılanındadır; satır uydurulmaz.
export function gecerliDeger<A extends AyarAnahtari>(anahtar: A, saklanan: { deger: unknown } | null): AyarDegeri<A> {
  if (saklanan === null) return varsayilanDeger(anahtar);
  const sonuc = degeriDogrula(anahtar, saklanan.deger);
  // Tanımın türü değişmiş ama saklanan değer taşınmamıştır: sessizce varsayılana dönmek ayarı kendiliğinden değiştirirdi.
  if ('hata' in sonuc) throw new Error(`Saklanan ayar değeri tanımın türüne uymuyor: ${anahtar}`);
  return sonuc.deger;
}

// Liste türe uymayan saklanan değerde düşmez: o ayar değersiz ve işaretli gelir, ötekiler okunur; değer uydurulmaz.
export function listeDegeri<A extends AyarAnahtari>(
  anahtar: A, saklanan: { deger: unknown } | null,
): { deger: AyarDegeri<A>; gecersiz: false } | { deger: null; gecersiz: true } {
  if (saklanan === null) return { deger: varsayilanDeger(anahtar), gecersiz: false };
  const sonuc = degeriDogrula(anahtar, saklanan.deger);
  return 'hata' in sonuc ? { deger: null, gecersiz: true } : { deger: sonuc.deger, gecersiz: false };
}

// Değiştirme komutu türe uymayan saklanan değeri de görür: başka modülün okuması onu reddeder, onarmanın yolu üstüne yazmaktır.
export function oncekiDeger(anahtar: AyarAnahtari, saklanan: { deger: unknown } | null): unknown {
  if (saklanan === null) return AYAR_TANIMLARI[anahtar].varsayilan;
  const sonuc = degeriDogrula(anahtar, saklanan.deger);
  return 'hata' in sonuc ? saklanan.deger : sonuc.deger;
}

// Güncelleme paketi (kart #870). Biçim: imleç satırı, başlık satırı (JSON: bildirim metni ve imzası), sonra yük.
// İmza bildirim metninin baytları üzerindedir; yükü bildirimdeki boyut ve SHA-256 bağlar. Anahtar ed25519 ortak anahtarıdır.
export const PAKET_IMLECI = 'TMIV2-GUNCELLEME 1\n';
// Bildirim göç adlarını ve değişiklik listesini taşır; ikisinin üst sınırı bu boya sığar.
export const AZAMI_PAKET_BASLIGI = 256 * 1024;
export const AZAMI_DEGISIKLIK = 200;
export const AZAMI_DEGISIKLIK_METNI = 300;
export const ACIK_GUNCELLEME_YUKLEMESI = 3;
export const BAYAT_GUNCELLEME_SAAT = 24;

const paketBildirimi = z.object({
  bicim: z.literal(1),
  surum: z.string().min(1).max(50),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  tarih: zamanSemasi,
  gocler: z.array(z.string().regex(/^[0-9]{14}_[a-z0-9_]+\.sql$/)).max(1000),
  not: z.string().max(2000).nullable(),
  // Önceki yayından bu yana birleşenler; ilk paketlerde yoktu (kart #886).
  degisiklikler: z.array(z.string().max(AZAMI_DEGISIKLIK_METNI)).max(AZAMI_DEGISIKLIK).default([]),
  // Değişikliklerin başladığı yayın (yayin/ öneksiz); 1065'ten önceki paketlerde yoktu.
  oncekiYayin: z.string().min(1).max(50).nullable().default(null),
  yukBoyut: z.number().int().nonnegative(),
  yukSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const paketBasligi = z.object({ bildirim: z.string().max(AZAMI_PAKET_BASLIGI), imza: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/) });

export type PaketBildirimi = z.output<typeof paketBildirimi>;
export type PaketReddi = 'imlecYok' | 'baslikBozuk' | 'imzaGecersiz' | 'bildirimBozuk' | 'yukUyusmuyor';

export const PAKET_REDDI_ILETISI: Readonly<Record<PaketReddi, string>> = {
  imlecYok: 'Dosya TMI CORE güncelleme paketi değil.',
  baslikBozuk: 'Paket başlığı okunamıyor.',
  imzaGecersiz: 'Paket imzası doğrulanamadı; paket bu kurum için imzalanmamış ya da değiştirilmiş.',
  bildirimBozuk: 'Paket bildirimi okunamıyor.',
  yukUyusmuyor: 'Paket içeriği bildirimle uyuşmuyor; dosya bozuk ya da eksik.',
};

// Ortak anahtar ortamda ham 32 bayt base64 olarak durur; bozuk ya da yanlış uzunluktaki değer kanalı kapatır, sunucuyu değil.
export function ortakAnahtar(base64: string): KeyObject | null {
  const ham = Buffer.from(base64.trim(), 'base64');
  if (ham.length !== 32 || ham.toString('base64') !== base64.trim()) return null;
  try {
    return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: ham.toString('base64url') }, format: 'jwk' });
  } catch {
    return null;
  }
}

// bas: dosyanın ilk baytları (en çok imleç + başlık + satır sonu). Sonuç yükün dosyadaki başlangıcını verir; yük ayrıca doğrulanır.
export function paketBasliginiCoz(bas: Buffer, anahtar: KeyObject): { bildirim: PaketBildirimi; yukBasi: number } | { red: PaketReddi } {
  const imlec = Buffer.from(PAKET_IMLECI, 'utf8');
  if (bas.length < imlec.length || !bas.subarray(0, imlec.length).equals(imlec)) return { red: 'imlecYok' };
  const son = bas.indexOf(0x0a, imlec.length);
  if (son < 0) return { red: 'baslikBozuk' };
  let baslik: z.output<typeof paketBasligi>;
  try {
    const sonuc = paketBasligi.safeParse(JSON.parse(bas.subarray(imlec.length, son).toString('utf8')));
    if (!sonuc.success) return { red: 'baslikBozuk' };
    baslik = sonuc.data;
  } catch {
    return { red: 'baslikBozuk' };
  }
  // İmza bildirim ayrıştırılmadan önce denetlenir: imzasız metin hiç yorumlanmaz.
  if (!verify(null, Buffer.from(baslik.bildirim, 'utf8'), anahtar, Buffer.from(baslik.imza, 'base64'))) return { red: 'imzaGecersiz' };
  try {
    const sonuc = paketBildirimi.safeParse(JSON.parse(baslik.bildirim));
    if (!sonuc.success) return { red: 'bildirimBozuk' };
    return { bildirim: sonuc.data, yukBasi: son + 1 };
  } catch {
    return { red: 'bildirimBozuk' };
  }
}

export function yukUyuyorMu(bildirim: PaketBildirimi, yuk: { boyut: number; sha256: string }): boolean {
  return bildirim.yukBoyut === yuk.boyut && bildirim.yukSha256 === yuk.sha256;
}

// Parçalar 512 KB'tır, yalnız sonuncusu kısa olabilir; toplam paket boyundan çıkar.
export function parcaSayisi(boyut: number, parca: number): number {
  return Math.ceil(boyut / parca);
}

export function parcaBoyuUyarMi(boyut: number, parca: number, sira: number, uzunluk: number): boolean {
  const toplam = parcaSayisi(boyut, parca);
  if (sira >= toplam) return false;
  return uzunluk === (sira === toplam - 1 ? boyut - parca * (toplam - 1) : parca);
}

// Paketi uygulama (kart #1210). Sunucu kendini değiştiremez: uygulamayı güncelleyici yapar (araclar/guncelleyici.ts), sunucuyu o
// açar ve durdurur. Sunucu istek dosyasını yazar; güncelleyici yedek alır, kurar, göçleri koşar, sonucu yazar. İkisi yalnız
// güncelleme klasöründeki bu dosyalarla konuşur; biçimler burada tek kaynaktır.
export const UYGULAMA_ISTEGI_DOSYASI = 'uygula.json';
export const UYGULAMA_SONUCU_DOSYASI = 'uygulama-sonucu.json';
// Her sonuç satır satır eklenir, silinmez: sonuç dosyası her uygulamada üstüne yazılır, hangi gün hangi sürümün kurulduğu buradan okunur.
export const UYGULAMA_GECMISI_DOSYASI = 'uygulama-gecmisi.jsonl';
export const CALISAN_SURUM_DOSYASI = 'calisan.json';
// Güncelleyicinin süreç numarası; sunucu Uygula'yı yalnız bu süreç yaşarken kabul eder.
export const GUNCELLEYICI_DOSYASI = 'guncelleyici.json';
// Güncelleyici isteği alınca uygulama bitene kadar bunu yazar (isteğin kendisi): sunucu o sürede kurulan sürüme ve pakete dokunmaz.
export const UYGULANIYOR_DOSYASI = 'uygulaniyor.json';
// Kurulan sürümler güncelleme klasöründe bu klasörün altında, her biri commit adıyladır.
export const SURUMLER_KLASORU = 'surumler';

const commitSemasi = z.string().regex(/^[0-9a-f]{40}$/);

// Güncelleyicinin açtığı sürüm. Güncelleyicisiz açılan sunucuda dosya yoktur; commit ortamdan (TMIV2_COMMIT) gelir, tarih bilinmez.
export const calisanSurumSemasi = z.object({ commit: commitSemasi.nullable(), surum: z.string().nullable(), tarih: zamanSemasi.nullable() });
export const guncelleyiciSemasi = z.object({ pid: z.number().int().positive() });
// İstek ve sonuç dosyası ekranın okuduğu biçimdedir.
export const uygulamaIstegiSemasi = guncellemeUygulamaIstegi;
export const uygulamaSonucuSemasi = guncellemeUygulamaSonucu;
export const gecmisKaydiSemasi = guncellemeGecmisKaydi;
// Sonuç dosyasındaki hata satırı bundan uzun yazılmaz.
export const UYGULAMA_HATASI_EN_UZUN = 1000;

export type UygulamaIstegi = z.output<typeof uygulamaIstegiSemasi>;
export type CalisanSurum = z.output<typeof calisanSurumSemasi>;
export type UygulamaSonucu = z.output<typeof uygulamaSonucuSemasi>;
export type GecmisKaydi = z.output<typeof gecmisKaydiSemasi>;

// Geçmişte sürüm adı yoksa (ilk kurulum, adsız sürüm) kısa commit yazılır; ikisi de yoksa bilinmez.
export function surumEtiketi(s: CalisanSurum): string | null {
  return s.surum ?? (s.commit === null ? null : s.commit.slice(0, 7));
}

// Paketin değişiklik listesi bir önceki yayından başlar (araclar/paket-yap.ts). Çalışan sürüm o yayın değilse aradaki yayınların
// değişiklikleri listede yoktur; uygulama yine güvenlidir (paket tam kopyadır), yalnız liste eksiktir.
export function atlamaUyarisi(paket: { oncekiYayin: string | null; commit: string }, calisan: CalisanSurum): string | null {
  if (paket.oncekiYayin === null || paket.commit === calisan.commit || paket.oncekiYayin === calisan.surum) return null;
  if (calisan.surum === null) {
    return `Değişiklikler ${paket.oncekiYayin} sonrasını gösterir; çalışan sürümün yayın adı bilinmiyor, aradaki yayınlar listede olmayabilir.`;
  }
  return `Değişiklikler ${paket.oncekiYayin} sonrasını gösterir; çalışan ${calisan.surum}. Aradaki yayınların değişiklikleri listede yok.`;
}

// Geçmiş dosyası satır satır okunur; bozuk satır (yarım yazılmış, elle değişmiş) atlanır, gerisi gösterilir. Yeniden eskiye.
export function gecmisiAyikla(metin: string, enCok: number): GecmisKaydi[] {
  const kayitlar: GecmisKaydi[] = [];
  for (const satir of metin.split(/\r?\n/).reverse()) {
    if (kayitlar.length >= enCok) break;
    if (satir.trim() === '') continue;
    try {
      const sonuc = gecmisKaydiSemasi.safeParse(JSON.parse(satir));
      if (sonuc.success) kayitlar.push(sonuc.data);
    } catch { /* bozuk satır */ }
  }
  return kayitlar;
}
export type UygulamaReddi = 'calisanSurum' | 'eksikGoc' | 'eskiSurum';

export const UYGULAMA_REDDI_ILETISI: Readonly<Record<UygulamaReddi, string>> = {
  calisanSurum: 'Bu sürüm zaten çalışıyor.',
  eksikGoc: 'Paket, veritabanına uygulanmış göçlerin hepsini taşımıyor; eski ya da başka koldan bir sürüm uygulanamaz.',
  eskiSurum: 'Paket çalışan sürümden eski; eski sürüme elle dönülmez.',
};

// Paket tam kopyadır: ara sürüm atlanabilir. Geri gitmek yasaktır (AY-G1): çalışanın her göçünü taşımayan ya da çalışandan eski
// derlenmiş paket reddedilir. Göç adları zaman damgalıdır; uygulanmış göç pakette yoksa paket o göçten önceye döner.
export function uygulamaReddi(
  paket: { commit: string; tarih: string; gocler: readonly string[] }, calisan: CalisanSurum & { gocler: readonly string[] },
): UygulamaReddi | null {
  if (calisan.commit !== null && paket.commit === calisan.commit) return 'calisanSurum';
  const pakettekiler = new Set(paket.gocler);
  if (calisan.gocler.some((g) => !pakettekiler.has(g))) return 'eksikGoc';
  if (calisan.tarih !== null && new Date(paket.tarih).getTime() < new Date(calisan.tarih).getTime()) return 'eskiSurum';
  return null;
}

// Eski paket ve kurulu sürüm silinebilir (kart #1210); güncelleyicinin kullandığı ya da kullanacağı silinmez.
export type SilmeReddi = 'calisan' | 'bekleyen' | 'uygulaniyor';

export const SILME_REDDI_ILETISI: Readonly<Record<SilmeReddi, string>> = {
  calisan: 'Çalışan sürüm silinemez.',
  bekleyen: 'Bu sürüm için bekleyen bir uygulama var; silinemez.',
  uygulaniyor: 'Bu sürüm şu an uygulanıyor; silinemez.',
};

// Paketin dosyası yalnız kurulumda okunur: çalışan sürümün paketi silinebilir. Kurulu sürüm klasöründen çalışan sürüm açılır ve
// geri dönüşte yeniden açılır; silinemez. Bekleyen ya da uygulanan sürümün ikisi de silinmez: istek yalnız sunucudan yazıldığı
// için, silme anında istek yoksa güncelleyici o sürüme silme bitmeden başlayamaz.
export function silmeReddi(
  tur: 'paket' | 'surum', commit: string, durum: { calisan: string | null; bekleyen: string | null; uygulaniyor: string | null },
): SilmeReddi | null {
  if (commit === durum.uygulaniyor) return 'uygulaniyor';
  if (commit === durum.bekleyen) return 'bekleyen';
  return tur === 'surum' && commit === durum.calisan ? 'calisan' : null;
}

// Veritabanı yedeği (kart #1205). Gece yedeği tesis saatiyle bu saatten sonra, günde bir kez alınır; sunucu o saatte kapalıysa
// açılınca alınır. Saklama: 14 günden eski yedek silinir, ama en yeni üç yedek yaşına bakılmadan kalır (yedek alınamayan
// günlerde son iyi kopyalar kendiliğinden silinmesin). Sınırlar sabittir; değiştirmek kod ve karar ister.
export const YEDEK_SAATI = 2;
export const YEDEK_SAKLAMA_GUN = 14;
export const YEDEK_EN_AZ_KALAN = 3;

// pg_dump çıktısının boyu önceden bilinmez; son yedeğin iki katı, büyüyen veritabanına ve şifreleme ekine pay bırakır.
export const YEDEK_EN_AZ_BOS_BAYT = 1024 ** 3;
const YEDEK_BOS_KATSAYISI = 2;
const gb = (bayt: number): string => (bayt / 1024 ** 3).toFixed(1).replace('.', ',');

// Boş yer bilinmiyorsa (klasör okunamadı) denetim yapılmaz: yer uydurulmaz, yedek denenir.
export function yedekYeriEksigi(bos: number | null, sonYedekBoyu: number | null): string | null {
  if (bos === null) return null;
  const gereken = Math.max(YEDEK_EN_AZ_BOS_BAYT, YEDEK_BOS_KATSAYISI * (sonYedekBoyu ?? 0));
  if (bos >= gereken) return null;
  return `Yedek klasöründe yer yetmiyor: boş ${gb(bos)} GB, gereken en az ${gb(gereken)} GB (son yedeğin iki katı, en az 1 GB). `
    + 'Yer açın; eski yedekler silinmedi.';
}
const GUN_MS = 24 * 60 * 60 * 1000;

export interface YedekDosyasi {
  ad: string;
  veritabani: string;
  tur: YedekTuru;
  zaman: Date;
}

// UTC zamanı adda saniyesiyle durur: yaz ve kış saati ya da sunucu saat dilimi adı belirsizleştirmez.
export function yedekAdi(veritabani: string, tur: YedekTuru, an: Date): string {
  const damga = an.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
  return `${veritabani}-${damga}-${tur}.dump`;
}

export function yedekAdiniCoz(ad: string): YedekDosyasi | null {
  const eslesme = YEDEK_ADI.exec(ad);
  if (!eslesme) return null;
  const [, veritabani, damga, tur] = eslesme as unknown as [string, string, string, YedekTuru];
  const zaman = new Date(damga.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));
  // 20261399T... gibi takvimde olmayan damga Date'te kayar; geri yazılan ad aynı değilse dosya bizim değildir.
  if (Number.isNaN(zaman.getTime()) || yedekAdi(veritabani, tur, zaman) !== ad) return null;
  return { ad, veritabani, tur, zaman };
}

// Bugünün (tesis günü) gece yedeği yoksa ve saat geldiyse alınır. Elle alınan yedek gece yedeğinin yerini tutmaz.
export function geceYedegiGerekliMi(yedekler: readonly YedekDosyasi[], simdi: Date): boolean {
  if (Number(tesisSaati(simdi).slice(11, 13)) < YEDEK_SAATI) return false;
  const bugun = tesisGunu(simdi);
  return !yedekler.some((y) => y.tur === 'gece' && tesisGunu(y.zaman) === bugun);
}

export function silinecekYedekler(yedekler: readonly YedekDosyasi[], simdi: Date): YedekDosyasi[] {
  const sinir = simdi.getTime() - YEDEK_SAKLAMA_GUN * GUN_MS;
  return [...yedekler]
    .sort((a, b) => b.zaman.getTime() - a.zaman.getTime())
    .slice(YEDEK_EN_AZ_KALAN)
    .filter((y) => y.zaman.getTime() < sinir);
}

// Yedek AES-256-GCM ile şifrelenir (kullanıcı kararı 145 a): içinde çizimler, sertifikalar ve parola özetleri vardır. Anahtar
// bilgi işlemde durur ve sunucuya yalnız ortamdan gelir; yedek klasörüne ya da veritabanına yazılmaz.
export type YedekAnahtari = { durum: 'tamam'; anahtar: Buffer } | { durum: 'yok' | 'gecersiz'; ileti: string };

const ANAHTAR_BICIMI = /^[A-Za-z0-9+/]{43}=$/;

export function yedekAnahtariCoz(metin: string | undefined): YedekAnahtari {
  const temiz = metin?.trim() ?? '';
  if (temiz === '') {
    return { durum: 'yok', ileti: 'Yedek kapalı: yedek anahtarı yok (TMIV2_YEDEK_ANAHTARI). Anahtarı bilgi işlem verir; kurulum/yedek.md.' };
  }
  if (!ANAHTAR_BICIMI.test(temiz)) {
    return { durum: 'gecersiz', ileti: 'Yedek kapalı: TMIV2_YEDEK_ANAHTARI 32 baytlık base64 değil (npm run yedek-anahtari ile üretilir).' };
  }
  return { durum: 'tamam', anahtar: Buffer.from(temiz, 'base64') };
}


// Talimat medyası aynası (1004 a, 1005 a). Medya dosyasının adı içeriğinin sha256 özetidir ve `<ab>/<cd>/<özet>` altında durur;
// dosya bir kez yazılır, değişmez. Ayna bu yüzden yalnız aynada olmayan adları kopyalar, içerik karşılaştırmaz. Kaynaktan silinen
// dosya aynada 30 gün daha durur: 14 günlük veritabanı yedeklerinin en eskisi geri yüklenince künyesinin dosyası bulunsun.
export const MEDYA_SILINEN_SAKLAMA_GUN = 30;
const MEDYA_OZETI = /^[0-9a-f]{64}$/;
const MEDYA_KLASORU = /^[0-9a-f]{2}$/;

export function medyaOzetiMi(ad: string): boolean {
  return MEDYA_OZETI.test(ad);
}

export function medyaKlasoruMu(ad: string): boolean {
  return MEDYA_KLASORU.test(ad);
}

// Özet `ab/cd/özet` klasörlerinin yerini kendisi belirler; ilk dört hanesi klasörlerle tutmayan dosya başka bir şeydir.
export function medyaYeriTutarMi(ab: string, cd: string, ozet: string): boolean {
  return medyaOzetiMi(ozet) && ozet.slice(0, 2) === ab && ozet.slice(2, 4) === cd;
}

export function medyaAltYolu(ozet: string): [string, string, string] {
  return [ozet.slice(0, 2), ozet.slice(2, 4), ozet];
}

export function silinenMedyaSilinsinMi(silinmeZamani: Date, simdi: Date): boolean {
  return simdi.getTime() - silinmeZamani.getTime() > MEDYA_SILINEN_SAKLAMA_GUN * GUN_MS;
}

// Ayna gece yedeğinin ardından koşar (önce veritabanı): dump'taki her künyenin dosyası o anda medya klasöründe vardır, ayna onu
// alır. Son gece yedeği aynadan yeniyse ayna gerekir; gece yedeği hiç yoksa ayna da beklenir.
export function medyaAynasiGerekliMi(sonGeceYedegi: Date | null, sonAyna: Date | null): boolean {
  if (sonGeceYedegi === null) return false;
  return sonAyna === null || sonAyna.getTime() < sonGeceYedegi.getTime();
}

// Ayna, kopyalayacağı dosyaların toplamına ek olarak veritabanı yedeğinin en az boş yerini bırakır: medya diski doldurup gece
// yedeğini düşürmesin.
export function medyaYeriEksigi(bos: number | null, gereken: number): string | null {
  if (bos === null) return null;
  const toplam = gereken + YEDEK_EN_AZ_BOS_BAYT;
  if (bos >= toplam) return null;
  return `Yedek klasöründe medya için yer yetmiyor: boş ${gb(bos)} GB, gereken en az ${gb(toplam)} GB (yeni medya artı 1 GB). `
    + 'Yer açın; medya aynası bu tur kopyalamadı.';
}
