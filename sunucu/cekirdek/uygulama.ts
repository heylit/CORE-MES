import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { HATA_DURUMU, HATA_KODU_BASLIGI, KAPSAM_DISI_ILETISI } from '#paylasilan/hata.ts';
import type { Ayar } from './ayar.ts';
import { kisitIhlali, vtDiskDolu, vtGeciciCakisma, vtHataIzi, vtSureDoldu, vtUlasilamadi, vtVeriHatasi } from './db.ts';
import type { KisitIhlali, Veritabani } from './db.ts';
import { UygulamaHatasi, cokBuyuk, mesgul, veritabaniYok } from './hata.ts';
import { istekOlcumunuKur } from './istek-olcumu.ts';
import { adresYokKaydet, isleyiciReddiniKaydet } from './red-kaydi.ts';
import { genelAramaUcu, kaynaklariKesfet } from './kayit-aramasi.ts';
import { surecGunlugunuKur, varsayilanGunlukDizini, type GunlukYazici } from './gunluk-dosyasi.ts';
import { surecOlayGunlugunuKur } from './olay-gunlugu.ts';
import type { TekrarDeposu } from './tekrar.ts';
import { uclariKaydet } from './uc.ts';
import type { Denetle, Kimlik, Uc } from './uc.ts';

export interface UygulamaSecenegi {
  vt: Veritabani;
  ayar: Ayar;
  kimlik?: Kimlik;
  denetle?: Denetle;
  tekrar?: TekrarDeposu;
  // Uçları kaydedilmeyen modüller. Sunucunun gerçek kablolaması `KAPALI_MODULLER`'i verir; verilmezse liste boştur ki kapalı
  // modülün kendi testleri uçlarıyla koşsun.
  kapaliModuller?: readonly string[];
}

// İstemci sunucuya aynı makinedeki önizleme vekilinden (4101) gelir. Yalnız ondan gelen X-Forwarded-For ve X-Forwarded-Proto
// okunur: giriş beklemesi gerçek cihaza göre sayılır, HTTPS bilinir. Ağdan doğrudan 4100'e gelen istekte başlık yok sayılır.
export const GUVENILEN_VEKIL = ['127.0.0.1', '::1'];

// Oturum çerezi ve yetki başlığı günlüğe düşmez: günlük dosyasını okuyan, oturumu ele geçiremesin. Varsayılan istek özeti başlık
// taşımaz; bu liste başlığı açıkça yazan bir satır için de geçerlidir.
export const GUNLUKTE_GIZLENENLER = [
  'req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', 'headers.cookie', 'headers.authorization', 'headers["set-cookie"]',
];
export const GIZLI_DEGER = '[gizli]';

export function gunlukSecenegi(ortam: Ayar['ortam']): false | { redact: { paths: string[]; censor: string } } {
  return ortam === 'test' ? false : { redact: { paths: GUNLUKTE_GIZLENENLER, censor: GIZLI_DEGER } };
}

// Testte günlük kapalıdır; öteki ortamlarda konsola ve günlük dosyasına yazılır, Windows'ta hata satırı olay günlüğüne de gider.
export function gunlukKur(
  ortam: Ayar['ortam'], dizin: string = varsayilanGunlukDizini(), platform: NodeJS.Platform = process.platform,
): false | { redact: { paths: string[]; censor: string }; stream: GunlukYazici } {
  const secenek = gunlukSecenegi(ortam);
  if (secenek === false) return false;
  const olay = platform === 'win32' ? surecOlayGunlugunuKur() : null;
  const stream = surecGunlugunuKur({
    dizin,
    konsol: (satir) => { process.stdout.write(satir); },
    ...(olay === null ? {} : { hataBildir: (h) => { olay.bildir(h); } }),
  });
  return { ...secenek, stream };
}

// Her istek günlükte bu kimlikle görünür; 5xx cevabı aynı kimliği başlıkta taşır ki kullanıcının söylediği kod günlükte bulunsun.
// Kimlik başlıktan alınmaz: istemci günlüğe istediği kimliği yazamasın. Kısa tutulur, kullanıcı okuyup söyler.
export function istekIziUret(): string {
  return randomUUID().slice(0, 8);
}

// Güvenilmeyen eşten gelen X-Forwarded-For, önde adresi tanımlanmamış bir vekil olduğunu gösterir (TMIV2_VEKIL_ADRESI boş):
// başlık yok sayılır, bütün cihazlar vekilin IP'si sayılır ve cihaz başına giriş sınırı herkese ortak olur. Doğrudan gelen
// kötü niyetli istek de aynı başlığı taşıyabilir; bu yüzden istek reddedilmez, günlüğe bir kez yazılır (kurulum/canli.md).
export function vekilUyarisiniKur(app: FastifyInstance, guvenilen: readonly string[], uyar: (ileti: string) => void): void {
  let uyarildi = false;
  app.addHook('onRequest', async (istek) => {
    if (uyarildi || istek.headers['x-forwarded-for'] === undefined) return;
    const es = (istek.raw.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    if (guvenilen.includes(es)) return;
    uyarildi = true;
    uyar(`X-Forwarded-For güvenilmeyen eşten geldi (${es || '?'}); başlık yok sayıldı. Ters vekil başka bilgisayardaysa adresini `
      + `TMIV2_VEKIL_ADRESI ile verin, yoksa bütün cihazlar vekilin IP'siyle sayılır (kurulum/canli.md).`);
  });
}

const MODUL_KLASORU = fileURLToPath(new URL('../moduller/', import.meta.url));

function govdeGonder(durum: number, govde: HataGovdesi): { durum: number; govde: HataGovdesi } {
  return { durum, govde };
}

interface CevrilmisHata {
  durum: number;
  govde: HataGovdesi;
  beklenmeyen: boolean;
  kisit?: KisitIhlali['iz'];
  gecici?: true;
  uyari?: string;
  // Kod kusuru değil ama kendiliğinden geçmez: günlüğe hata düzeyinde düşer.
  alarm?: string;
}

function hatayiCevir(hata: unknown): CevrilmisHata {
  if (hata instanceof UygulamaHatasi) {
    return { ...govdeGonder(hata.durum, hata.govde()), beklenmeyen: false };
  }
  const ihlal = kisitIhlali(hata);
  if (ihlal !== null) {
    return { ...govdeGonder(ihlal.hata.durum, ihlal.hata.govde()), beklenmeyen: false, kisit: ihlal.iz };
  }
  const veri = vtVeriHatasi(hata);
  if (veri !== null) {
    // Sık görünürse hangi alanın ön denetimi eksik olduğu buradan bulunur.
    return { ...govdeGonder(veri.durum, veri.govde()), beklenmeyen: false, uyari: 'Veritabanı değeri reddetti' };
  }
  // Kilitlenme ya da serileştirme hatası (yinelemeden sonra da sürdüyse): istek kusurlu değil, sistem yarışı kaybetti;
  // istemci yeniden deneyebilir.
  if (vtGeciciCakisma(hata)) {
    const ret = mesgul();
    return { ...govdeGonder(ret.durum, ret.govde()), beklenmeyen: false, gecici: true };
  }
  // Süre sınırı (ifade ya da kilit bekleme) ve kopan bağlantı da istek kusuru değildir: beklemekle geçebilir, istemci
  // yeniden deneyebilir. Kod kusuru olmadıkları için "beklenmeyen hata" demek kullanıcıyı yanıltır; günlüğe yine düşer.
  if (vtSureDoldu(hata)) {
    const ret = mesgul();
    return { ...govdeGonder(ret.durum, ret.govde()), beklenmeyen: false, uyari: 'Sorgu süre sınırına takıldı' };
  }
  // Kullanıcı düzeltemez, yeniden denemek de geçirmez: kime haber vereceği söylenir.
  if (vtDiskDolu(hata)) {
    const ret = veritabaniYok('Sunucu diski dolu, bilgi işleme haber verin.');
    return { ...govdeGonder(ret.durum, ret.govde()), beklenmeyen: false, alarm: 'Veritabanı diski dolu' };
  }
  if (vtUlasilamadi(hata)) {
    const ret = veritabaniYok('Veritabanına ulaşılamıyor, birkaç saniye sonra tekrar deneyin.');
    return { ...govdeGonder(ret.durum, ret.govde()), beklenmeyen: false, uyari: 'Veritabanına ulaşılamadı' };
  }
  const durum = (hata as { statusCode?: unknown } | null)?.statusCode;
  // Gövde sınırı aşıldı: istek bozuk değil, büyük; "okunamadı" kullanıcıya ne yapacağını söylemez.
  if (durum === HATA_DURUMU.COK_BUYUK) {
    const ret = cokBuyuk('Gönderilen veri izin verilen boyuttan büyük. Dosyayı ya da metni küçültüp yeniden deneyin.');
    return { ...govdeGonder(ret.durum, ret.govde()), beklenmeyen: false };
  }
  // Fastify'ın kendi istek hataları (bozuk JSON, büyük gövde) istemci kusurudur, sunucu hatası sayılmaz.
  if (typeof durum === 'number' && durum >= 400 && durum < 500) {
    return {
      ...govdeGonder(HATA_DURUMU.DOGRULAMA, { kod: 'DOGRULAMA', mesaj: 'İstek okunamadı.' }),
      beklenmeyen: false,
    };
  }
  return {
    ...govdeGonder(HATA_DURUMU.SUNUCU, { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' }),
    beklenmeyen: true,
  };
}

export function hataYonetiminiKur(app: FastifyInstance): void {
  app.setErrorHandler((hata, istek, yanit) => {
    const { durum, govde, beklenmeyen, kisit, gecici, uyari, alarm } = hatayiCevir(hata);
    if (beklenmeyen) istek.log.error({ err: vtHataIzi(hata) ?? hata }, 'Beklenmeyen hata');
    // Sık görünürse hangi uca yineleme işareti gerektiği buradan bulunur.
    if (gecici) istek.log.warn({ err: vtHataIzi(hata) }, 'Kilitlenme ya da serileştirme hatası');
    if (alarm) istek.log.error({ err: vtHataIzi(hata) }, alarm);
    if (uyari) istek.log.warn({ err: vtHataIzi(hata) ?? hata }, uyari);
    // Cevap hangi kısıt olduğunu söylemez; ön denetimden kaçan kural yalnız buradan bulunur.
    if (kisit) istek.log.info({ kisit }, 'Kısıt ihlali');
    if (durum >= HATA_DURUMU.SUNUCU) void yanit.header(HATA_KODU_BASLIGI, istek.id);
    if (hata instanceof UygulamaHatasi && hata.kod === 'YETKI_YOK') {
      // Uç tanımındaki yol kalıbı yazılır (kapının yazdığıyla aynı biçim); adresteki kimlik yazılmaz.
      const kalip = istek.routeOptions.url?.replace(/^\/api(?=\/)/, '') ?? null;
      isleyiciReddiniKaydet(istek, kalip, hata.message === KAPSAM_DISI_ILETISI);
    }
    return yanit.code(durum).send(govde);
  });
  app.setNotFoundHandler((istek, yanit) => {
    adresYokKaydet(istek);
    const govde: HataGovdesi = { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' };
    return yanit.code(HATA_DURUMU.BULUNAMADI).send(govde);
  });
}

export interface ModulUclari {
  modul: string;
  uclar: Uc[];
}

export async function modulBasinaUclar(klasor: string = MODUL_KLASORU): Promise<ModulUclari[]> {
  if (!existsSync(klasor)) return [];
  const girdiler = await readdir(klasor, { withFileTypes: true });
  const adlar = girdiler.filter((g) => g.isDirectory()).map((g) => g.name).sort();
  const sonuc: ModulUclari[] = [];
  for (const ad of adlar) {
    const dosya = join(klasor, ad, 'uclar.ts');
    if (!existsSync(dosya)) continue;
    const modul = (await import(pathToFileURL(dosya).href)) as { uclar?: unknown };
    if (!Array.isArray(modul.uclar)) {
      throw new Error(`Modül uç dizisi vermiyor (export const uclar): moduller/${ad}/uclar.ts`);
    }
    sonuc.push({ modul: ad, uclar: modul.uclar as Uc[] });
  }
  return sonuc;
}

export async function modulUclariniKesfet(klasor: string = MODUL_KLASORU): Promise<Uc[]> {
  return (await modulBasinaUclar(klasor)).flatMap((m) => m.uclar);
}

// Günlük klasörü verilmezse depo klasörünün yanındaki TMIV2-GUNLUK; testler geçici klasör verir.
export async function uygulamaKur(secenek: UygulamaSecenegi, gunlukDizini?: string): Promise<FastifyInstance> {
  // Eksik seçenek derlemede de testte de görünmez: kimliksiz sunucu herkesi oturumsuz sayar, denetimsiz sunucu komutu
  // uygulayıp kaydını yazmaz. Yalnız test eksik seçenekle kurabilir.
  if (secenek.ayar.ortam !== 'test') {
    const eksik = (['kimlik', 'denetle', 'tekrar'] as const).filter((ad) => secenek[ad] === undefined);
    if (eksik.length > 0) {
      throw new Error(`Uygulama eksik seçenekle kurulamaz (ortam: ${secenek.ayar.ortam}); verilmeyen: ${eksik.join(', ')}`);
    }
  }
  const { vt, ayar, kimlik = async () => null, denetle, tekrar } = secenek;
  const guvenilen = ayar.vekilAdresi === undefined ? GUVENILEN_VEKIL : [...GUVENILEN_VEKIL, ayar.vekilAdresi];
  // İstek başına tek satır: Fastify'ın "incoming request" ve "request completed" satırları kapalıdır, yerine "Uç süresi"
  // satırı (istek-olcumu.ts) yazılır. Beklenmeyen hata hata yöneticisinde ayrıca yazılır.
  const app = Fastify({
    logger: gunlukKur(ayar.ortam, gunlukDizini), trustProxy: guvenilen, genReqId: istekIziUret, requestIdHeader: false, disableRequestLogging: true,
  });
  vekilUyarisiniKur(app, guvenilen, (ileti) => { app.log.warn(ileti); });
  hataYonetiminiKur(app);
  istekOlcumunuKur(app);
  const kapali = secenek.kapaliModuller ?? [];
  for (const { modul, uclar } of await modulBasinaUclar()) {
    if (kapali.includes(modul)) continue;
    uclariKaydet(app, uclar, {
      vt, kimlik, modul, guvenliCerez: ayar.ortam === 'canli', ...(denetle ? { denetle } : {}), ...(tekrar ? { tekrar } : {}),
    });
  }
  // Genel arama çekirdeğindir: modüllerin `disari.ts` kaynaklarını toplar, kapalı modülünkiler dışarıda kalır.
  uclariKaydet(app, [genelAramaUcu(vt, await kaynaklariKesfet(MODUL_KLASORU, kapali))], {
    vt, kimlik, modul: 'cekirdek', guvenliCerez: ayar.ortam === 'canli',
  });
  return app;
}
