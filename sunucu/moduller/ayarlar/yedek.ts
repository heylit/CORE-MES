import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, readdirSync } from 'node:fs';
import { open, readdir, rename, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ayarOku } from '#cekirdek/ayar.ts';
import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { bulunamadi, cakisma, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import { isBekliyor, type IsBekliyor } from '#cekirdek/zamanlayici.ts';
import type {
  Yedek, YedekAlCevabi, YedekDiziniKaynagi, YedekDurumu, YedekIndirmeIzniCevabi, YedekTuru, YedeklerCevabi,
} from '#paylasilan/sozlesme/ayarlar.ts';
import {
  YEDEK_EN_AZ_KALAN, YEDEK_SAATI, YEDEK_SAKLAMA_GUN, geceYedegiGerekliMi, silinecekYedekler, yedekAdi, yedekAdiniCoz, yedekAnahtariCoz,
  yedekYeriEksigi, type YedekAnahtari, type YedekDosyasi,
} from './kurallar.ts';
import { nabiz } from './sorgular.ts';

// Veritabanı yedeği (kart #1205) diske yazılır, veritabanına değil. Klasör ekranda seçilir (`yedek-dizini.ts`), seçilmediyse
// ortamdan gelir; ikisi de yoksa yedek kapalıdır, sunucu yine açılır. pg_dump uygulama kullanıcısıyla bağlanır: her tabloyu okuyabilir, yeni yetki istemez. Parola komut satırına
// girmez (süreç listesinde görünürdü), alt sürecin ortamından verilir.
export interface PgBaglantisi {
  host: string;
  port: number;
  kullanici: string;
  parola: string;
  veritabani: string;
}

export interface PgDumpKomutu {
  dosya: string;
  onEk: readonly string[];
}

export interface YedekOrtami {
  dizin: string | null;
  kaynak: YedekDiziniKaynagi | null;
  pg: PgBaglantisi;
  pgDump: PgDumpKomutu;
  anahtar: YedekAnahtari;
}

// Windows'ta PostgreSQL'in bin klasörü genelde PATH'te değildir: TMIV2_PG_DUMP boşsa standart kurulum yeri aranır. Gece yedeği,
// `npm run yedek` ve güncelleyici aynı ortamı bu işlevden alır; biri bulup öbürü bulamamasın.
export interface PgDumpArama {
  platform: NodeJS.Platform;
  klasorOku(yol: string): string[];
  varMi(yol: string): boolean;
}

const sistemdeAra: PgDumpArama = { platform: process.platform, klasorOku: (yol) => readdirSync(yol), varMi: existsSync };

// Birden çok sürüm kuruluysa en yenisi seçilir: pg_dump veritabanı sunucusundan eski olamaz.
export function windowsPgDump(programFiles: readonly string[], klasorOku: (yol: string) => string[], varMi: (yol: string) => boolean): string | null {
  for (const kokKlasor of programFiles) {
    const pg = path.win32.join(kokKlasor, 'PostgreSQL');
    let surumler: string[];
    try { surumler = klasorOku(pg); } catch { continue; }
    const adaylar = surumler
      .filter((s) => /^\d+(\.\d+)?$/.test(s))
      .sort((a, b) => Number.parseFloat(b) - Number.parseFloat(a))
      .map((s) => path.win32.join(pg, s, 'bin', 'pg_dump.exe'))
      .filter(varMi);
    if (adaylar[0] !== undefined) return adaylar[0];
  }
  return null;
}

function pgDumpBul(env: NodeJS.ProcessEnv, arama: PgDumpArama): string {
  const verilen = env['TMIV2_PG_DUMP']?.trim() ?? '';
  if (verilen !== '') return verilen;
  if (arama.platform !== 'win32') return 'pg_dump';
  const kokler = [env['ProgramFiles'], env['ProgramW6432'], env['ProgramFiles(x86)']].filter((d): d is string => d !== undefined && d !== '');
  return windowsPgDump(kokler, arama.klasorOku, arama.varMi) ?? 'pg_dump';
}

export function yedekOrtamiOku(env: NodeJS.ProcessEnv = process.env, arama: PgDumpArama = sistemdeAra): YedekOrtami {
  const dizin = env['TMIV2_YEDEK_DIZINI']?.trim() ?? '';
  const { host, port, kullanici, parola, veritabani } = ayarOku(env).pg;
  return {
    dizin: dizin === '' ? null : dizin,
    kaynak: dizin === '' ? null : 'ortam',
    pg: { host, port, kullanici, parola, veritabani },
    pgDump: { dosya: pgDumpBul(env, arama), onEk: [] },
    anahtar: yedekAnahtariCoz(env['TMIV2_YEDEK_ANAHTARI']),
  };
}

// Büyük veritabanında bile bir gece yedeği bu süreyi aşmaz; aşan pg_dump takılmıştır, durdurulur.
const EN_UZUN_MS = 2 * 60 * 60 * 1000;
// Gece işi zamanlayıcının transaction'ı içinde koşar; pg_dump sürerken transaction boşta kalırsa veritabanı onu keser
// (TMIV2_PG_BOS_TX_SURE_MS). Bu aralıkla kısa sorgu gider.
const NABIZ_MS = 1000;
const YARIM_EKI = '.yarim';
const YARIM_SAKLAMA_MS = 24 * 60 * 60 * 1000;
// Geri yüklemenin (araclar/guncelleyici.ts yedegiGeriYukle) yedeğin yanına yazdığı geçici dosyalar; ikisi bütün veritabanını
// şifresiz taşır. Süreç yarıda kesilirse (elektrik, zorla kapatma) kalırlar.
const GERI_YUKLEME_EKLERI = ['.cozulmus', '.geri.sql', '.bosalt.sql'];
const HATA_METNI_EN_UZUN = 300;

async function acikDizin(dizin: string | null): Promise<string | null> {
  if (dizin === null || !path.isAbsolute(dizin)) return null;
  const bilgi = await stat(dizin).catch(() => null);
  return bilgi !== null && bilgi.isDirectory() ? dizin : null;
}

const KAPALI_ILETISI = 'Yedek kapalı: yedek klasörü seçilmedi (TMIV2_YEDEK_DIZINI de yok) ya da klasör sunucuda yok.';

async function dizinIste(ortam: YedekOrtami): Promise<string> {
  const dizin = await acikDizin(ortam.dizin);
  if (dizin === null) throw gecersiz(KAPALI_ILETISI);
  return dizin;
}

function anahtarIste(ortam: YedekOrtami): Buffer {
  if (ortam.anahtar.durum !== 'tamam') throw gecersiz(ortam.anahtar.ileti);
  return ortam.anahtar.anahtar;
}

// Şifreli yedek: imza, rastgele IV, şifreli pg_dump çıktısı, sonda GCM etiketi. Etiket dosyanın sonundadır: şifreleme akarken
// yazılır, çözmede önce okunur. İmza, şifreleme öncesinden kalan düz yedeği ayırır (geri yükleme ikisini de alır).
const SIFRE_IMZASI = Buffer.from('TMIV2Y1\n', 'ascii');
const IV_BOYU = 12;
const ETIKET_BOYU = 16;
const BOZUK_ILETISI = 'Yedek açılamadı: anahtar uymuyor ya da dosya bozuk.';

export async function yedekSifreliMi(yol: string): Promise<boolean> {
  const dosya = await open(yol, 'r');
  try {
    const bas = Buffer.alloc(SIFRE_IMZASI.length);
    const { bytesRead } = await dosya.read(bas, 0, bas.length, 0);
    return bytesRead === bas.length && bas.equals(SIFRE_IMZASI);
  } finally {
    await dosya.close();
  }
}

// Çıktı ancak etiket doğrulanınca kalır: yanlış anahtar ya da bozuk dosya yarım düz dosya bırakmaz.
export async function yedekSifresiniCoz(anahtar: Buffer, kaynak: string, hedef: string): Promise<void> {
  const { size } = await stat(kaynak);
  const basBoyu = SIFRE_IMZASI.length + IV_BOYU;
  if (size < basBoyu + ETIKET_BOYU || !(await yedekSifreliMi(kaynak))) throw new Error(BOZUK_ILETISI);
  const dosya = await open(kaynak, 'r');
  const iv = Buffer.alloc(IV_BOYU);
  const etiket = Buffer.alloc(ETIKET_BOYU);
  try {
    await dosya.read(iv, 0, IV_BOYU, SIFRE_IMZASI.length);
    await dosya.read(etiket, 0, ETIKET_BOYU, size - ETIKET_BOYU);
  } finally {
    await dosya.close();
  }
  const coz = createDecipheriv('aes-256-gcm', anahtar, iv).setAuthTag(etiket);
  try {
    // Yalnız şifreli gövde okunur; boş gövdede okuma aralığı ters düşmesin diye ayrı tutulur.
    const govde = size - basBoyu - ETIKET_BOYU === 0 ? [] : createReadStream(kaynak, { start: basBoyu, end: size - ETIKET_BOYU - 1 });
    await pipeline(govde, coz, createWriteStream(hedef, { flags: 'wx' }));
  } catch (hata) {
    await rm(hedef, { force: true });
    if (hata instanceof Error && 'code' in hata && hata.code === 'EEXIST') throw hata;
    throw new Error(BOZUK_ILETISI);
  }
}

// Süreç içi durum: aynı süreçte aynı anda tek yedek alınır. İki süreç aynı klasöre yazsa da adlar saniyeyle ayrışır.
let suren: { tur: YedekTuru; baslangic: Date; is: Promise<YedekDosyasi> } | null = null;
let sonHata: { zaman: Date; ileti: string } | null = null;

// Yalnız testin beklemesi içindir: elle başlatılan yedek cevaptan sonra sürer.
export function surenYedek(): Promise<unknown> | null {
  return suren?.is.catch(() => undefined) ?? null;
}

// Alt sürece sunucunun TMIV2_ değişkenleri (parolalar, anahtarlar) geçmez; yalnız işletim sisteminin ve PostgreSQL'in ortamı.
function altSurecOrtami(parola: string): NodeJS.ProcessEnv {
  const ortam = Object.fromEntries(Object.entries(process.env).filter(([ad]) => !ad.toUpperCase().startsWith('TMIV2_')));
  return { ...ortam, PGPASSWORD: parola };
}

// Veritabanı yedeği ve medya aynası aynı biçimi yazar: ikisi de aynı anahtar ve aynı çözücüyle açılır.
export function sifreliYaz(anahtar: Buffer, kaynak: AsyncIterable<Buffer>, hedef: string): Promise<void> {
  const iv = randomBytes(IV_BOYU);
  const sifrele = createCipheriv('aes-256-gcm', anahtar, iv);
  return pipeline(kaynak, sifrele, async function* (sifreli) {
    yield Buffer.concat([SIFRE_IMZASI, iv]);
    for await (const parca of sifreli) yield parca as Buffer;
    yield sifrele.getAuthTag();
  }, createWriteStream(hedef));
}

// pg_dump standart çıktıya yazar ve çıktı şifrelenerek dosyaya akar: düz yedek diske hiç düşmez.
function pgDumpCalistir(komut: PgDumpKomutu, pg: PgBaglantisi, anahtar: Buffer, hedef: string): Promise<void> {
  const argumanlar = [
    ...komut.onEk, '--format=custom', '--no-password', `--host=${pg.host}`, `--port=${String(pg.port)}`,
    `--username=${pg.kullanici}`, `--dbname=${pg.veritabani}`,
  ];
  const surec = spawn(komut.dosya, argumanlar, {
    env: altSurecOrtami(pg.parola), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const yazim = sifreliYaz(anahtar, surec.stdout, hedef);
  const bitis = new Promise<void>((coz, reddet) => {
    let hataMetni = '';
    surec.stderr.setEncoding('utf8');
    surec.stderr.on('data', (parca: string) => {
      if (hataMetni.length < HATA_METNI_EN_UZUN) hataMetni += parca;
    });
    const sure = setTimeout(() => { surec.kill(); }, EN_UZUN_MS);
    surec.on('error', (hata: NodeJS.ErrnoException) => {
      clearTimeout(sure);
      reddet(new Error(hata.code !== 'ENOENT'
        ? `pg_dump başlatılamadı: ${hata.message}`
        : /[\\/]/.test(komut.dosya)
          ? `pg_dump bulunamadı (${komut.dosya}); TMIV2_PG_DUMP'taki tam yolu denetleyin.`
          : `pg_dump bulunamadı (${komut.dosya}): PATH'te yok, Windows'ta PostgreSQL kurulum klasöründe de yok; tam yolu TMIV2_PG_DUMP ile verin.`));
    });
    surec.on('close', (kod, sinyal) => {
      clearTimeout(sure);
      if (kod === 0) { coz(); return; }
      const ilk = hataMetni.trim().split(/\r?\n/)[0]?.slice(0, HATA_METNI_EN_UZUN) ?? '';
      reddet(new Error(sinyal !== null
        ? `pg_dump durduruldu (${sinyal}); ${String(EN_UZUN_MS / 60_000)} dakikayı aştı ya da sunucu kapandı.`
        : `pg_dump hata verdi (çıkış ${String(kod)})${ilk === '' ? '' : `: ${ilk}`}`));
    });
  });
  // Süreç hatası önce gelir: pg_dump başlamazsa ya da düşerse yazımın hatası değil onun iletisi görünür.
  return Promise.allSettled([bitis, yazim]).then(([surecSonucu, yazimSonucu]) => {
    if (surecSonucu.status === 'rejected') throw surecSonucu.reason;
    if (yazimSonucu.status === 'rejected') throw yazimSonucu.reason;
  });
}

export type BosYerOkuyucu = (dizin: string) => Promise<number | null>;

// Servis hesabının kullanabileceği boş yer; klasör okunamıyorsa bilinmiyor.
export async function bosYerOku(dizin: string): Promise<number | null> {
  try {
    const s = await statfs(dizin);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

// Güncelleyici bunu sunucuyu durdurmadan önce de çağırır: yer yoksa güncelleme hiç başlamaz.
export async function yedekYeriniDenetle(dizin: string, veritabani: string, bosYer: BosYerOkuyucu = bosYerOku): Promise<void> {
  const { yedekler } = await dosyalar(dizin, veritabani);
  const son = yedekler.reduce<YedekDosyasi | null>((a, y) => (a === null || y.zaman > a.zaman ? y : a), null);
  const sonBoy = son === null ? null : (await stat(path.join(dizin, son.ad)).catch(() => null))?.size ?? null;
  const eksik = yedekYeriEksigi(await bosYer(dizin), sonBoy);
  if (eksik !== null) throw new Error(eksik);
}

// Yarım dosya `.yarim` ekiyle yazılır, bitince adına taşınır: listede ve indirmede yalnız tamamlanmış yedek görünür.
// Durum denetimi ve kaydı ilk beklemeden önce, eşzamanlı yapılır; iki çağrı arasında ikinci yedek başlayamaz.
export function yedekAl(ortam: YedekOrtami, dizin: string, tur: YedekTuru, simdi: Date, bosYer: BosYerOkuyucu = bosYerOku): Promise<YedekDosyasi> {
  if (suren !== null) return Promise.reject(cakisma('Bir yedek zaten alınıyor; bitince yeniden deneyin.'));
  let anahtar: Buffer;
  try { anahtar = anahtarIste(ortam); } catch (hata) { return Promise.reject(hata as Error); }
  const ad = yedekAdi(ortam.pg.veritabani, tur, simdi);
  const hedef = path.join(dizin, ad);
  const is = (async () => {
    try {
      await yedekYeriniDenetle(dizin, ortam.pg.veritabani, bosYer);
      await pgDumpCalistir(ortam.pgDump, ortam.pg, anahtar, hedef + YARIM_EKI);
      await rename(hedef + YARIM_EKI, hedef);
      sonHata = null;
      return { ad, veritabani: ortam.pg.veritabani, tur, zaman: simdi };
    } catch (hata) {
      await rm(hedef + YARIM_EKI, { force: true });
      sonHata = { zaman: new Date(), ileti: hata instanceof Error ? hata.message : String(hata) };
      throw hata;
    } finally {
      suren = null;
    }
  })();
  suren = { tur, baslangic: simdi, is };
  return is;
}

async function dosyalar(dizin: string, veritabani: string): Promise<{ yedekler: YedekDosyasi[]; yarimlar: string[]; artiklar: string[] }> {
  const adlar = await readdir(dizin);
  const bizim = (a: string, ek: string): boolean => a.endsWith(ek) && yedekAdiniCoz(a.slice(0, -ek.length))?.veritabani === veritabani;
  const yedekler = adlar.map(yedekAdiniCoz).filter((y): y is YedekDosyasi => y !== null && y.veritabani === veritabani);
  const yarimlar = adlar.filter((a) => bizim(a, YARIM_EKI));
  const artiklar = adlar.filter((a) => GERI_YUKLEME_EKLERI.some((ek) => bizim(a, ek)));
  return { yedekler, yarimlar, artiklar };
}

// Silme yalnız bu veritabanının adlandırılmış yedeklerine dokunur; klasördeki başka dosya kalır.
export async function yedekleriTemizle(dizin: string, veritabani: string, simdi: Date, gunluk: Gunluk): Promise<string[]> {
  const { yedekler, yarimlar, artiklar } = await dosyalar(dizin, veritabani);
  const silinen: string[] = [];
  for (const y of silinecekYedekler(yedekler, simdi)) {
    try {
      await rm(path.join(dizin, y.ad));
      silinen.push(y.ad);
    } catch (hata) {
      gunluk.uyar(`Eski yedek silinemedi: ${y.ad}`, hata);
    }
  }
  for (const ad of yarimlar) {
    const bilgi = await stat(path.join(dizin, ad)).catch(() => null);
    // Başka süreçte süren yedeğin yarım dosyası genç olur; yalnız bir günden eski artık silinir.
    if (bilgi !== null && simdi.getTime() - bilgi.mtimeMs > YARIM_SAKLAMA_MS) {
      await rm(path.join(dizin, ad), { force: true });
      silinen.push(ad);
    }
  }
  // Yaş beklenmez: geri yükleme sunucu kapalıyken koşar (güncelleyici önce durdurur, komut açık oturum varsa reddeder);
  // sunucu bu turu koşuyorsa süren geri yükleme yoktur ve dosya yarım kalmış bir işten artmıştır.
  for (const ad of artiklar) {
    try {
      await rm(path.join(dizin, ad), { force: true });
      silinen.push(ad);
      gunluk.uyar(`Yarım kalmış geri yüklemenin şifresiz dosyası silindi: ${ad}`);
    } catch (hata) {
      gunluk.uyar(`Yarım kalmış geri yüklemenin şifresiz dosyası silinemedi: ${ad}`, hata);
    }
  }
  return silinen;
}

// Gece işi: bugünün yedeği yoksa ve saat geldiyse alır, sonra eskileri siler. Klasör yoksa bekler, hata vermez.
export async function geceYedegiTuru(db: Db, gunluk: Gunluk, ortam: YedekOrtami, simdi: Date): Promise<void | IsBekliyor> {
  const dizin = await acikDizin(ortam.dizin);
  if (dizin === null) return isBekliyor(KAPALI_ILETISI);
  if (ortam.anahtar.durum !== 'tamam') return isBekliyor(ortam.anahtar.ileti);
  const { yedekler } = await dosyalar(dizin, ortam.pg.veritabani);
  if (geceYedegiGerekliMi(yedekler, simdi)) {
    if (suren !== null) return isBekliyor('Elle alınan yedek sürüyor; gece yedeği sonraki turda alınır.');
    const sayac = setInterval(() => {
      nabiz(db).catch((hata: unknown) => { gunluk.uyar('Yedek sürerken veritabanı nabzı gitmedi', hata); });
    }, NABIZ_MS);
    try {
      await yedekAl(ortam, dizin, 'gece', simdi);
    } finally {
      clearInterval(sayac);
    }
  }
  await yedekleriTemizle(dizin, ortam.pg.veritabani, simdi, gunluk);
}

export async function yedekleriListele(ortam: YedekOrtami): Promise<YedeklerCevabi> {
  const dizin = await acikDizin(ortam.dizin);
  const durum: YedekDurumu = dizin === null ? 'dizin-yok' : ortam.anahtar.durum !== 'tamam' ? 'anahtar-yok' : 'acik';
  const yedekler: Yedek[] = [];
  if (dizin !== null) {
    for (const y of (await dosyalar(dizin, ortam.pg.veritabani)).yedekler) {
      const bilgi = await stat(path.join(dizin, y.ad)).catch(() => null);
      if (bilgi === null) continue;
      yedekler.push({ ad: y.ad, tur: y.tur, zaman: y.zaman.toISOString(), boyut: bilgi.size });
    }
  }
  yedekler.sort((a, b) => b.zaman.localeCompare(a.zaman));
  return {
    durum, saat: YEDEK_SAATI, saklamaGun: YEDEK_SAKLAMA_GUN, enAzKalan: YEDEK_EN_AZ_KALAN,
    suruyor: suren === null ? null : { tur: suren.tur, baslangic: suren.baslangic.toISOString() },
    sonHata: sonHata === null ? null : { zaman: sonHata.zaman.toISOString(), ileti: sonHata.ileti },
    yedekler,
    dizin: ortam.dizin,
    kaynak: ortam.kaynak,
  };
}

// Elle yedek cevabı beklemez: pg_dump dakikalar sürebilir, istek transaction'ı o kadar açık kalamaz. Sonuç listede görünür.
export async function elleYedekBaslat(ortam: YedekOrtami, gunluk: Gunluk, simdi: Date): Promise<YedekAlCevabi> {
  const dizin = await dizinIste(ortam);
  anahtarIste(ortam);
  const is = yedekAl(ortam, dizin, 'elle', simdi);
  void is
    .then(() => yedekleriTemizle(dizin, ortam.pg.veritabani, new Date(), gunluk))
    .catch((hata: unknown) => { gunluk.hata('Elle yedek alınamadı', hata); });
  return { baslangic: simdi.toISOString() };
}

async function yedekDosyasi(ortam: YedekOrtami, ad: string): Promise<{ ad: string; yol: string; boyut: number }> {
  const dizin = await dizinIste(ortam);
  const yedek = yedekAdiniCoz(ad);
  if (yedek === null || yedek.veritabani !== ortam.pg.veritabani) throw bulunamadi('Yedek bulunamadı.');
  const yol = path.join(dizin, yedek.ad);
  const bilgi = await stat(yol).catch(() => null);
  if (bilgi === null || !bilgi.isFile()) throw bulunamadi('Yedek bulunamadı.');
  return { ad: yedek.ad, yol, boyut: bilgi.size };
}

// Okuma ucu denetim kaydı yazamaz (okuma transaction'ı salt okunur); indirme bu yüzden iki adımdır (145 a): izin komutu kişi ve
// yedek adıyla denetime düşer, indirme o izinle bir kez yapılır. İzin bu süreçte tutulur (tek sunucu): sunucu yeniden açılınca
// verilmiş izinler düşer, kullanıcı yeniden "İndir"e basar.
const IZIN_SURESI_MS = 60_000;
const izinler = new Map<string, { ad: string; kisiId: number; son: number }>();

function eskiIzinleriSil(simdi: number): void {
  for (const [izin, kayit] of izinler) if (kayit.son <= simdi) izinler.delete(izin);
}

export async function indirmeIzniVer(ortam: YedekOrtami, ad: string, kisiId: number, simdi: Date): Promise<YedekIndirmeIzniCevabi> {
  const yedek = await yedekDosyasi(ortam, ad);
  eskiIzinleriSil(simdi.getTime());
  const izin = randomBytes(24).toString('base64url');
  izinler.set(izin, { ad: yedek.ad, kisiId, son: simdi.getTime() + IZIN_SURESI_MS });
  return { izin };
}

// İzin denendiği anda harcanır: tutmayan denemeden sonra da ikinci kez kullanılamaz.
export async function yedekIndir(ortam: YedekOrtami, ad: string, kisiId: number, izin: string, gunluk: Gunluk): Promise<IkiliCevap> {
  const kayit = izinler.get(izin);
  izinler.delete(izin);
  eskiIzinleriSil(Date.now());
  if (kayit === undefined || kayit.ad !== ad || kayit.kisiId !== kisiId || kayit.son <= Date.now()) {
    throw yetkiYok('İndirme izni yok ya da süresi geçti; "İndir"e yeniden basın.');
  }
  const yedek = await yedekDosyasi(ortam, ad);
  const yol = yedek.yol;
  gunluk.uyar(`Yedek indirildi: ${yedek.ad} (kişi ${String(kisiId)})`);
  return {
    tur: 'application/octet-stream',
    ad: yedek.ad,
    boyut: yedek.boyut,
    akis: async function* () {
      for await (const parca of createReadStream(yol)) yield parca as Buffer;
    },
  };
}
