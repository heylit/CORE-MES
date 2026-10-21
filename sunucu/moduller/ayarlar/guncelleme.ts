import { createHash, type KeyObject } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { bulunamadi, cakisma, cokIstek, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import {
  GUNCELLEME_PARCASI, guncellemePaketiSemasi, type GuncellemeKanali, type GuncellemePaketi, type GuncellemePaketleriCevabi,
  type GuncellemeKuruluSurum, type GuncellemeParcasiCevabi, type GuncellemeParcasiGovdesi, type GuncellemeUygulamaIstegi,
} from '#paylasilan/sozlesme/ayarlar.ts';
import {
  ACIK_GUNCELLEME_YUKLEMESI, AZAMI_PAKET_BASLIGI, BAYAT_GUNCELLEME_SAAT, CALISAN_SURUM_DOSYASI, GUNCELLEYICI_DOSYASI, PAKET_IMLECI,
  PAKET_REDDI_ILETISI, SILME_REDDI_ILETISI, SURUMLER_KLASORU, UYGULANIYOR_DOSYASI, guncelleyiciSemasi, silmeReddi,
  UYGULAMA_ISTEGI_DOSYASI, UYGULAMA_REDDI_ILETISI, UYGULAMA_SONUCU_DOSYASI, calisanSurumSemasi, ortakAnahtar, paketBasliginiCoz,
  parcaBoyuUyarMi, parcaSayisi, uygulamaIstegiSemasi, uygulamaReddi, uygulamaSonucuSemasi, yukUyuyorMu, type CalisanSurum,
  type PaketBildirimi,
} from './kurallar.ts';
import { yedekDizini } from './yedek-dizini.ts';

// Güncelleme paketi veritabanına değil diske yazılır (kart #870): paket yüzlerce MB olabilir. Dizin ve imza anahtarı
// yalnız ortamdan gelir; ikisinden biri yoksa kanal kapalıdır, sunucu yine açılır. Sunucu paketi uygulamaz, istek dosyasını
// yazar; uygulamayı sunucuyu açan güncelleyici yapar (kart #1210).
export interface GuncellemeOrtami {
  dizin: string | null;
  anahtar: string | null;
  commit: string | null;
}

export function ortamdanOku(env: NodeJS.ProcessEnv = process.env): GuncellemeOrtami {
  const dizin = env['TMIV2_GUNCELLEME_DIZINI']?.trim() ?? '';
  const anahtar = env['TMIV2_GUNCELLEME_ANAHTARI']?.trim() ?? '';
  const commit = env['TMIV2_COMMIT']?.trim() ?? '';
  return {
    dizin: dizin === '' ? null : dizin,
    anahtar: anahtar === '' ? null : anahtar,
    commit: commit === '' ? null : commit,
  };
}

// Çalışan kodun göçleri: bekleyen göçle sunucu açılmadığı için veritabanına uygulanmış olanlarla aynıdır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));

type Kanal = { durum: 'acik'; dizin: string; anahtar: KeyObject } | { durum: Exclude<GuncellemeKanali, 'acik'> };

async function kanal(o: GuncellemeOrtami): Promise<Kanal> {
  if (o.dizin === null || !path.isAbsolute(o.dizin)) return { durum: 'dizin-yok' };
  const bilgi = await stat(o.dizin).catch(() => null);
  if (bilgi === null || !bilgi.isDirectory()) return { durum: 'dizin-yok' };
  if (o.anahtar === null) return { durum: 'anahtar-yok' };
  const anahtar = ortakAnahtar(o.anahtar);
  if (anahtar === null) return { durum: 'anahtar-gecersiz' };
  return { durum: 'acik', dizin: o.dizin, anahtar };
}

// Kanal yalnız geçerli imza anahtarıyla açılır; imzasız paket hiçbir durumda yüklenmez.
export async function guncellemeKanaliDurumu(o: GuncellemeOrtami = ortamdanOku()): Promise<GuncellemeKanali> {
  return (await kanal(o)).durum;
}

const KAPALI_ILETISI: Readonly<Record<Exclude<GuncellemeKanali, 'acik'>, string>> = {
  'dizin-yok': 'Güncelleme kanalı kapalı: sunucuda TMIV2_GUNCELLEME_DIZINI tanımlı değil ya da klasör yok.',
  'anahtar-yok': 'Güncelleme kanalı kapalı: sunucuda TMIV2_GUNCELLEME_ANAHTARI tanımlı değil.',
  'anahtar-gecersiz': 'Güncelleme kanalı kapalı: TMIV2_GUNCELLEME_ANAHTARI geçerli bir ed25519 ortak anahtarı değil.',
};

async function acikKanal(o: GuncellemeOrtami): Promise<Extract<Kanal, { durum: 'acik' }>> {
  const k = await kanal(o);
  if (k.durum !== 'acik') throw gecersiz(KAPALI_ILETISI[k.durum]);
  return k;
}

// Yükleme durumu dosyası iki istek arasında okunup yazılır; aynı süreçteki istekler sıraya girer ki parça kaybolmasın.
let sira: Promise<unknown> = Promise.resolve();
function sirayla<T>(is: () => Promise<T>): Promise<T> {
  const sonuc = sira.then(is, is);
  sira = sonuc.catch(() => undefined);
  return sonuc;
}

interface YuklemeDurumu {
  kisiId: number;
  boyut: number;
  alinan: number[];
  baslangic: string;
}

const yuklemeDizini = (dizin: string): string => path.join(dizin, 'yuklemeler');
const paketDizini = (dizin: string): string => path.join(dizin, 'paketler');
// Kimlik sözleşmede UUID'ye denetlenmiş ve küçük harfe çevrilmiştir; yola başka bir şey girmez.
const durumYolu = (dizin: string, kimlik: string): string => path.join(yuklemeDizini(dizin), `${kimlik}.json`);
const parcaYolu = (dizin: string, kimlik: string): string => path.join(yuklemeDizini(dizin), `${kimlik}.parca`);

async function durumOku(dizin: string, kimlik: string): Promise<YuklemeDurumu | null> {
  const metin = await readFile(durumYolu(dizin, kimlik), 'utf8').catch(() => null);
  return metin === null ? null : (JSON.parse(metin) as YuklemeDurumu);
}

async function yuklemeyiSil(dizin: string, kimlik: string): Promise<void> {
  await rm(parcaYolu(dizin, kimlik), { force: true });
  await rm(durumYolu(dizin, kimlik), { force: true });
}

// Yarım kalan yükleme bir gün sonra atılır; yeni yükleme açılırken fırsatla temizlenir.
async function bayatlariTemizle(dizin: string, simdi: Date): Promise<number> {
  let acik = 0;
  for (const ad of await readdir(yuklemeDizini(dizin))) {
    if (!ad.endsWith('.json')) continue;
    const kimlik = ad.slice(0, -'.json'.length);
    const durum = await durumOku(dizin, kimlik).catch(() => null);
    const yas = durum === null ? Infinity : simdi.getTime() - new Date(durum.baslangic).getTime();
    if (yas > BAYAT_GUNCELLEME_SAAT * 3600_000) await yuklemeyiSil(dizin, kimlik);
    else acik += 1;
  }
  return acik;
}

export function parcaYaz(
  o: GuncellemeOrtami, kisiId: number, kimlik: string, g: GuncellemeParcasiGovdesi, simdi: Date,
): Promise<GuncellemeParcasiCevabi> {
  return sirayla(async () => {
    const { dizin } = await acikKanal(o);
    await mkdir(yuklemeDizini(dizin), { recursive: true });
    let durum = await durumOku(dizin, kimlik);
    if (durum === null) {
      if (await bayatlariTemizle(dizin, simdi) >= ACIK_GUNCELLEME_YUKLEMESI) {
        throw cokIstek('Açık güncelleme yüklemesi çok; biri bitince ya da bir gün sonra yeniden deneyin.');
      }
      durum = { kisiId, boyut: g.boyut, alinan: [], baslangic: simdi.toISOString() };
    } else if (durum.kisiId !== kisiId) {
      // Başkasının yüklemesine parça eklenemez; varlığı da söylenmez.
      throw bulunamadi('Yükleme bulunamadı.');
    } else if (durum.boyut !== g.boyut) {
      throw gecersiz('Parçanın paket boyu yüklemeninkiyle aynı değil.');
    }
    const veri = Buffer.from(g.veri, 'base64');
    if (!parcaBoyuUyarMi(g.boyut, GUNCELLEME_PARCASI, g.sira, veri.length)) throw dogrulama('Parçanın boyu ya da sırası pakete uymuyor.', 'veri');
    const dosya = await open(parcaYolu(dizin, kimlik), durum.alinan.length === 0 ? 'w' : 'r+');
    try {
      await dosya.write(veri, 0, veri.length, g.sira * GUNCELLEME_PARCASI);
    } finally {
      await dosya.close();
    }
    if (!durum.alinan.includes(g.sira)) durum.alinan = [...durum.alinan, g.sira].sort((a, b) => a - b);
    await writeFile(durumYolu(dizin, kimlik), JSON.stringify(durum));
    return { alinan: durum.alinan.length, toplam: parcaSayisi(g.boyut, GUNCELLEME_PARCASI) };
  });
}

async function basiOku(yol: string, bayt: number): Promise<Buffer> {
  const dosya = await open(yol, 'r');
  try {
    const tampon = Buffer.alloc(bayt);
    const { bytesRead } = await dosya.read(tampon, 0, bayt, 0);
    return tampon.subarray(0, bytesRead);
  } finally {
    await dosya.close();
  }
}

async function yukOzeti(yol: string, bas: number): Promise<{ boyut: number; sha256: string }> {
  const ozet = createHash('sha256');
  let boyut = 0;
  for await (const parca of createReadStream(yol, { start: bas })) {
    const b = parca as Buffer;
    boyut += b.length;
    ozet.update(b);
  }
  return { boyut, sha256: ozet.digest('hex') };
}

export function yuklemeyiBitir(o: GuncellemeOrtami, kisiId: number, kimlik: string, simdi: Date): Promise<GuncellemePaketi> {
  return sirayla(async () => {
    const { dizin, anahtar } = await acikKanal(o);
    const durum = await durumOku(dizin, kimlik);
    if (durum?.kisiId !== kisiId) throw bulunamadi('Yükleme bulunamadı.');
    if (durum.alinan.length < parcaSayisi(durum.boyut, GUNCELLEME_PARCASI)) throw gecersiz('Paketin bütün parçaları gelmedi.');
    const yol = parcaYolu(dizin, kimlik);
    // Reddedilen paket saklanmaz: yeniden yükleme baştan başlar.
    const reddet = async (ileti: string): Promise<never> => {
      await yuklemeyiSil(dizin, kimlik);
      throw gecersiz(ileti);
    };
    const cozum = paketBasliginiCoz(await basiOku(yol, Buffer.byteLength(PAKET_IMLECI) + AZAMI_PAKET_BASLIGI + 1), anahtar);
    if ('red' in cozum) return reddet(PAKET_REDDI_ILETISI[cozum.red]);
    if (!yukUyuyorMu(cozum.bildirim, await yukOzeti(yol, cozum.yukBasi))) return reddet(PAKET_REDDI_ILETISI.yukUyusmuyor);
    const { bildirim } = cozum;
    await mkdir(paketDizini(dizin), { recursive: true });
    const hedef = path.join(paketDizini(dizin), `${bildirim.commit}.tmip`);
    if (await stat(hedef).catch(() => null) !== null) {
      await yuklemeyiSil(dizin, kimlik);
      throw cakisma('Bu sürümün paketi zaten yüklü.');
    }
    const paket: GuncellemePaketi = {
      surum: bildirim.surum, commit: bildirim.commit, tarih: bildirim.tarih, gocler: bildirim.gocler, not: bildirim.not,
      degisiklikler: bildirim.degisiklikler,
      boyut: durum.boyut, yukleyenId: kisiId, yuklenme: simdi.toISOString(),
    };
    await rename(yol, hedef);
    // Bildirim dosyası paketten sonra yazılır: listede görünen paketin dosyası hep tamdır.
    await writeFile(path.join(paketDizini(dizin), `${bildirim.commit}.json`), JSON.stringify(paket));
    await rm(durumYolu(dizin, kimlik), { force: true });
    return paket;
  });
}

async function jsonOku<T>(yol: string, sema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T | null> {
  const metin = await readFile(yol, 'utf8').catch(() => null);
  if (metin === null) return null;
  try {
    const sonuc = sema.safeParse(JSON.parse(metin));
    return sonuc.success ? sonuc.data : null;
  } catch {
    return null;
  }
}

// Güncelleyicinin yazdığı dosya ortamdakinden önce gelir: güncelleyici sürümün tarihini de bilir.
async function calisanOku(o: GuncellemeOrtami, dizin: string | null): Promise<CalisanSurum> {
  const dosya = dizin === null ? null : await jsonOku(path.join(dizin, CALISAN_SURUM_DOSYASI), calisanSurumSemasi);
  return dosya ?? { commit: o.commit, surum: null, tarih: null };
}

// Güncelleyici açılınca süreç numarasını dosyaya yazar. Ortam değişkeniyle bildirilemez: .env varken sunucu, dosyada olmayan
// TMIV2_ değişkenini çelişki sayıp açılmaz (araclar/ortam.ts). Süreç yaşamıyorsa dosya artıktır.
async function guncelleyiciVarMi(dizin: string | null): Promise<boolean> {
  if (dizin === null) return false;
  const kayit = await jsonOku(path.join(dizin, GUNCELLEYICI_DOSYASI), guncelleyiciSemasi);
  if (kayit === null) return false;
  try {
    process.kill(kayit.pid, 0);
    return true;
  } catch (hata) {
    return (hata as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// Güncelleyici yedeksiz kurmaz (dogrula adımı); aynı denetim burada yapılır ki istek kabul edilip sonra düşmesin.
const YEDEK_YOK_ILETISI = 'Yedek klasörü yok: Sistem Ayarları > Yedekler bölümünden klasör seçin; yedeksiz güncelleme yapılmaz.';
async function yedekDurumu(guncellemeDizini: string | null): Promise<{ dizin: string | null; hazir: boolean }> {
  if (guncellemeDizini === null) return { dizin: null, hazir: false };
  const dizin = await yedekDizini(guncellemeDizini);
  const bilgi = dizin === null ? null : await stat(dizin).catch(() => null);
  return { dizin, hazir: bilgi?.isDirectory() === true };
}

async function calisanGocler(): Promise<string[]> {
  return (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql'));
}

async function bildirimler(dizin: string): Promise<GuncellemePaketi[]> {
  const adlar = await readdir(paketDizini(dizin)).catch(() => [] as string[]);
  const paketler: GuncellemePaketi[] = [];
  for (const ad of adlar.filter((a) => a.endsWith('.json'))) {
    // Elle bozulmuş bildirim dosyası listeyi düşürmez; o paket görünmez.
    const paket = await jsonOku(path.join(paketDizini(dizin), ad), guncellemePaketiSemasi);
    if (paket !== null) paketler.push(paket);
  }
  return paketler;
}

interface SilmeDurumu { calisan: string | null; bekleyen: string | null; uygulaniyor: string | null }

async function istekler(dizin: string): Promise<{ bekleyen: GuncellemeUygulamaIstegi | null; uygulaniyor: GuncellemeUygulamaIstegi | null }> {
  return {
    bekleyen: await jsonOku(path.join(dizin, UYGULAMA_ISTEGI_DOSYASI), uygulamaIstegiSemasi),
    uygulaniyor: await jsonOku(path.join(dizin, UYGULANIYOR_DOSYASI), uygulamaIstegiSemasi),
  };
}

function silinemez(tur: 'paket' | 'surum', commit: string, durum: SilmeDurumu): string | null {
  const red = silmeReddi(tur, commit, durum);
  return red === null ? null : SILME_REDDI_ILETISI[red];
}

// Yalnız commit adlı klasörler sürümdür; güncelleyicinin yarım kurulum klasörü (`<commit>.yarim`) listeye girmez.
async function kuruluSurumler(dizin: string, paketler: readonly GuncellemePaketi[], durum: SilmeDurumu): Promise<GuncellemeKuruluSurum[]> {
  const girdiler = await readdir(path.join(dizin, SURUMLER_KLASORU), { withFileTypes: true }).catch(() => []);
  const bildirim = new Map(paketler.map((p) => [p.commit, p]));
  return girdiler.filter((g) => g.isDirectory() && /^[0-9a-f]{40}$/.test(g.name)).map((g) => {
    const p = bildirim.get(g.name);
    const calisan = g.name === durum.calisan;
    return { commit: g.name, surum: p?.surum ?? null, tarih: p?.tarih ?? null, calisan, silinemez: silinemez('surum', g.name, durum) };
  }).sort((a, b) => Number(b.calisan) - Number(a.calisan)
    || (b.tarih === null ? 0 : new Date(b.tarih).getTime()) - (a.tarih === null ? 0 : new Date(a.tarih).getTime())
    || a.commit.localeCompare(b.commit));
}

export async function paketleriListele(o: GuncellemeOrtami): Promise<GuncellemePaketleriCevabi> {
  const k = await kanal(o);
  const dizin = k.durum === 'acik' ? k.dizin : null;
  const calisan = await calisanOku(o, dizin);
  const ortak = { guncelleyici: await guncelleyiciVarMi(dizin), calisan, yedek: await yedekDurumu(dizin) };
  if (dizin === null) return { kanal: k.durum, paketler: [], surumler: [], bekleyen: null, uygulaniyor: null, sonUygulama: null, ...ortak };
  const gocler = await calisanGocler();
  const { bekleyen, uygulaniyor } = await istekler(dizin);
  const durum: SilmeDurumu = { calisan: calisan.commit, bekleyen: bekleyen?.commit ?? null, uygulaniyor: uygulaniyor?.commit ?? null };
  const bildirimListesi = await bildirimler(dizin);
  const paketler = bildirimListesi.map((p) => {
    const red = uygulamaReddi(p, { ...calisan, gocler });
    return { ...p, uygulanamaz: red === null ? null : UYGULAMA_REDDI_ILETISI[red], silinemez: silinemez('paket', p.commit, durum) };
  });
  paketler.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime() || a.commit.localeCompare(b.commit));
  return {
    kanal: 'acik', paketler, ...ortak, bekleyen, uygulaniyor,
    surumler: await kuruluSurumler(dizin, bildirimListesi, durum),
    sonUygulama: await jsonOku(path.join(dizin, UYGULAMA_SONUCU_DOSYASI), uygulamaSonucuSemasi),
  };
}

const SUREN_UYGULAMA_ILETISI = 'Bir güncelleme uygulanıyor; o bitmeden yenisi istenemez.';
const ayniIstek = (a: GuncellemeUygulamaIstegi, b: GuncellemeUygulamaIstegi): boolean =>
  a.commit === b.commit && a.isteyenId === b.isteyenId && a.istenme === b.istenme;

// İstek dosyası yalnız yoksa yazılır ('wx'): ikinci istek, güncelleyici ilkini almadan 409 alır. Güncelleyici isteği alınca
// dosyayı siler ve uygulama bitene kadar "uygulanıyor" işaretini tutar; o sürede de yeni istek 409 alır, yoksa ilki biter bitmez
// ikinci güncelleme kendiliğinden başlardı. Uygulamanın kendisi burada değil.
export function uygulamaIste(o: GuncellemeOrtami, kisiId: number, commit: string, simdi: Date): Promise<GuncellemeUygulamaIstegi> {
  return sirayla(async () => {
    const { dizin } = await acikKanal(o);
    if (!await guncelleyiciVarMi(dizin)) throw gecersiz('Sunucu güncelleyiciyle açılmadı; paket uygulanamaz. Sunucuyu "npm run baslat" ile açın.');
    if (!(await yedekDurumu(dizin)).hazir) throw gecersiz(YEDEK_YOK_ILETISI);
    const paket = await jsonOku(path.join(paketDizini(dizin), `${commit}.json`), guncellemePaketiSemasi);
    if (paket === null || await stat(path.join(paketDizini(dizin), `${commit}.tmip`)).catch(() => null) === null) {
      throw bulunamadi('Paket bulunamadı.');
    }
    const red = uygulamaReddi(paket, { ...await calisanOku(o, dizin), gocler: await calisanGocler() });
    if (red !== null) throw gecersiz(UYGULAMA_REDDI_ILETISI[red]);
    if ((await istekler(dizin)).uygulaniyor !== null) throw cakisma(SUREN_UYGULAMA_ILETISI);
    const istek: GuncellemeUygulamaIstegi = { commit, isteyenId: kisiId, istenme: simdi.toISOString() };
    const yol = path.join(dizin, UYGULAMA_ISTEGI_DOSYASI);
    try {
      await writeFile(yol, JSON.stringify(istek), { flag: 'wx' });
    } catch (hata) {
      if ((hata as NodeJS.ErrnoException).code === 'EEXIST') throw cakisma('Bekleyen bir uygulama var; o bitmeden yenisi istenemez.');
      throw hata;
    }
    // Ön denetimle yazma arasında güncelleyici o anki bekleyen isteği almış olabilir. İşaret başka isteğinse bu istek geri çekilir;
    // dosya artık yoksa güncelleyici bu isteği de almıştır (öncekini bitirmiş), istek geçerlidir.
    const suren = (await istekler(dizin)).uygulaniyor;
    if (suren !== null && !ayniIstek(suren, istek)) {
      try {
        await rm(yol);
      } catch (hata) {
        if ((hata as NodeJS.ErrnoException).code === 'ENOENT') return istek;
        throw hata;
      }
      throw cakisma(SUREN_UYGULAMA_ILETISI);
    }
    return istek;
  });
}

// Silme, uygulama isteğiyle aynı sırada yürür: aynı anda yazılan istek ve silinen paket birbirini görür.
async function sil(o: GuncellemeOrtami, tur: 'paket' | 'surum', commit: string): Promise<{ commit: string }> {
  return sirayla(async () => {
    const { dizin } = await acikKanal(o);
    const { bekleyen, uygulaniyor } = await istekler(dizin);
    const durum: SilmeDurumu = {
      calisan: (await calisanOku(o, dizin)).commit, bekleyen: bekleyen?.commit ?? null, uygulaniyor: uygulaniyor?.commit ?? null,
    };
    const red = silmeReddi(tur, commit, durum);
    if (red !== null) throw gecersiz(SILME_REDDI_ILETISI[red]);
    if (tur === 'paket') {
      const yollar = ['tmip', 'json'].map((uzanti) => path.join(paketDizini(dizin), `${commit}.${uzanti}`));
      if ((await Promise.all(yollar.map((y) => stat(y).catch(() => null)))).every((b) => b === null)) throw bulunamadi('Paket bulunamadı.');
      // Önce bildirim silinir: yarıda kalan silme listede yarım paket göstermez.
      for (const y of [...yollar].reverse()) await rm(y, { force: true });
    } else {
      const klasor = path.join(dizin, SURUMLER_KLASORU, commit);
      if (!(await stat(klasor).catch(() => null))?.isDirectory()) throw bulunamadi('Kurulu sürüm bulunamadı.');
      await rm(klasor, { recursive: true, force: true });
    }
    return { commit };
  });
}

export const paketiSil = (o: GuncellemeOrtami, commit: string): Promise<{ commit: string }> => sil(o, 'paket', commit);
export const surumuSil = (o: GuncellemeOrtami, commit: string): Promise<{ commit: string }> => sil(o, 'surum', commit);

// Güncelleyici paketi kurmadan önce imzasını ve yükünü yeniden doğrular: saklandıktan sonra değişen dosya kurulmaz.
export async function saklananPaketiDogrula(
  dizin: string, anahtarMetni: string, commit: string,
): Promise<{ bildirim: PaketBildirimi; yol: string; yukBasi: number }> {
  const anahtar = ortakAnahtar(anahtarMetni);
  if (anahtar === null) throw new Error(KAPALI_ILETISI['anahtar-gecersiz']);
  const yol = path.join(paketDizini(dizin), `${commit}.tmip`);
  const cozum = paketBasliginiCoz(await basiOku(yol, Buffer.byteLength(PAKET_IMLECI) + AZAMI_PAKET_BASLIGI + 1), anahtar);
  if ('red' in cozum) throw new Error(PAKET_REDDI_ILETISI[cozum.red]);
  if (cozum.bildirim.commit !== commit) throw new Error('Paket dosyası istenen sürüme ait değil.');
  if (!yukUyuyorMu(cozum.bildirim, await yukOzeti(yol, cozum.yukBasi))) throw new Error(PAKET_REDDI_ILETISI.yukUyusmuyor);
  return { bildirim: cozum.bildirim, yol, yukBasi: cozum.yukBasi };
}
