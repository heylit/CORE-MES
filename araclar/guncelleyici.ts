import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, posix, win32 } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import {
  CALISAN_SURUM_DOSYASI, GUNCELLEYICI_DOSYASI, SURUMLER_KLASORU, UYGULAMA_GECMISI_DOSYASI, UYGULAMA_HATASI_EN_UZUN, UYGULAMA_ISTEGI_DOSYASI,
  UYGULAMA_REDDI_ILETISI, UYGULAMA_SONUCU_DOSYASI, UYGULANIYOR_DOSYASI, calisanSurumSemasi, saklananPaketiDogrula, surumEtiketi,
  uygulamaIstegiSemasi, uygulamaReddi, yedekAl, yedekDizini as seciliYedekDizini, yedekOrtamiOku, yedekSifreliMi, yedekSifresiniCoz,
  yedekYeriniDenetle, type CalisanSurum, type GecmisKaydi, type UygulamaIstegi, type UygulamaSonucu,
} from '../sunucu/moduller/ayarlar/disari.ts';
import { GOC_KIMLIGI, anaAgacKoku, envYolu, ortamiYukle } from './ortam.ts';
import { binYolu, npmCliBul } from './paket-bin.ts';
import { NPM_ONBELLEGI } from './paket.ts';
import { tarAc } from './tar-oku.ts';

// Güncelleyici (kart #1210): sunucuyu açar, Sistem Ayarları'ndan istenen paketi uygular. Sunucu kendini değiştiremez; istek
// dosyasını yazar, gerisi buradadır. Kurulan her sürüm `<güncelleme klasörü>/surumler/<commit>` altında kendi klasöründedir:
// eski sürüm yerinde kalır, geri dönüş klasör değiştirmektir. Veritabanı göçten önce yedeklenir; göç ya da açılış bozulursa
// yedek geri yüklenir ve eski sürüm açılır. Ayarların tek kaynağı ilk kurulumun (`npm run baslat` koşulan ağaç) `.env`'idir.

export type Adim = 'dogrula' | 'hazirla' | 'durdur' | 'yedek' | 'goc' | 'acilis';

export interface UygulamaAdimlari {
  // İmza, yük ve AY-G1 yeniden denetlenir; paketin sürüm adını verir.
  dogrula(): Promise<string>;
  // Eski sürüm çalışırken: yük açılır, bağımlılıklar kurulur, ekran derlenir.
  hazirla(): Promise<void>;
  durdur(): Promise<void>;
  yedekle(): Promise<void>;
  gocle(): Promise<void>;
  // Yeni sürüm açılır ve sağlık ucu cevap verir; açılamazsa kendi süreçlerini kapatıp hata verir.
  yeniyiAc(): Promise<void>;
  geriYukle(): Promise<void>;
  eskiyiAc(): Promise<void>;
}

const hataMetni = (hata: unknown): string =>
  (hata instanceof Error ? hata.message : String(hata)).split(/\r?\n/)[0]?.slice(0, UYGULAMA_HATASI_EN_UZUN) ?? '';

// Veritabanı yalnız göç başladıktan sonra değişebilir: ondan önceki hatada geri yükleme gerekmez, eski sürüm yeniden açılır.
// Geri yükleme de bozulursa eski sürüm açılmaz: eski kod yeni şemayla çalışmasın; elle geri yükleme gerekir (kurulum/yedek.md).
// kaydet her adımdan önce çağrılır: güncelleyici uygulama ortasında öldürülürse açılışta hangi adımda kaldığı okunur.
export async function paketiUygula(
  istek: UygulamaIstegi, a: UygulamaAdimlari, saat: () => Date = () => new Date(),
  kaydet: (adim: Adim, surum: string) => Promise<void> = async () => {},
): Promise<UygulamaSonucu> {
  const baslangic = saat().toISOString();
  let surum = istek.commit.slice(0, 7);
  let adim: Adim = 'dogrula';
  const gec = async (yeni: Adim): Promise<void> => { adim = yeni; await kaydet(adim, surum); };
  const sonuc = (s: UygulamaSonucu['sonuc'], hata: string | null): UygulamaSonucu => ({
    commit: istek.commit, surum, sonuc: s, adim: s === 'kuruldu' ? null : adim, hata, baslangic, bitis: saat().toISOString(),
  });

  try {
    await gec('dogrula');
    surum = await a.dogrula();
    await gec('hazirla');
    await a.hazirla();
  } catch (hata) {
    return sonuc('basarisiz', hataMetni(hata));
  }

  try {
    await gec('durdur');
    await a.durdur();
    await gec('yedek');
    await a.yedekle();
  } catch (hata) {
    const ilk = hataMetni(hata);
    try {
      await a.eskiyiAc();
    } catch (acilis) {
      return sonuc('basarisiz', `${ilk}; eski sürüm de açılamadı: ${hataMetni(acilis)}`);
    }
    return sonuc('basarisiz', ilk);
  }

  try {
    await gec('goc');
    await a.gocle();
    await gec('acilis');
    await a.yeniyiAc();
    return sonuc('kuruldu', null);
  } catch (hata) {
    const ilk = hataMetni(hata);
    try {
      await a.geriYukle();
    } catch (geri) {
      return sonuc('basarisiz', `${ilk}; yedek geri yüklenemedi, sunucu kapalı bırakıldı: ${hataMetni(geri)}`);
    }
    try {
      await a.eskiyiAc();
    } catch (acilis) {
      return sonuc('basarisiz', `${ilk}; yedek geri yüklendi ama eski sürüm açılamadı: ${hataMetni(acilis)}`);
    }
    return sonuc('geri-alindi', ilk);
  }
}

// Güncelleyicinin kendi dosyası (sunucu okumaz): süren uygulamanın adımı, eski sürüm ve alınan yedek. Uygulama bitince silinir;
// açılışta duruyorsa önceki güncelleyici uygulama ortasında öldürülmüştür (bekçi, elektrik kesintisi).
export const UYGULAMA_DURUMU_DOSYASI = 'uygulama-durumu.json';
const ADIMLAR = ['dogrula', 'hazirla', 'durdur', 'yedek', 'goc', 'acilis'] as const satisfies readonly Adim[];
export const uygulamaDurumuSemasi = z.object({
  istek: uygulamaIstegiSemasi,
  surum: z.string(),
  adim: z.enum(ADIMLAR),
  eski: z.object({ klasor: z.string(), surum: calisanSurumSemasi }),
  yedek: z.string().nullable(),
  baslangic: z.string(),
  // Yarım kalan uygulama geri yüklenemediyse: sunucu elle geri yükleme yapılıp bu dosya silinene kadar açılmaz.
  elle: z.boolean().default(false),
});
export type UygulamaDurumu = z.output<typeof uygulamaDurumuSemasi>;

// Bekçi uygulamayı bu işaretin tazeliğiyle izler (araclar/bekci.ts GUNCELLEME_PAYI_MS); uzun göç sürerken de işaret yenilenir.
export const ISARET_YENILEME_MS = 60_000;

export interface YarimKalanSonucu { sonuc: UygulamaSonucu; eskiAcilsin: boolean }

// Veritabanı yalnız göç adımında değişir: ondan önce kalan uygulamada eski sürüm açılır. Göç ya da açılışta kalanda alınan yedek
// geri yüklenir; yüklenemezse eski kod yarım şemayla çalışmasın diye sunucu kapalı kalır (paketiUygula ile aynı kural).
export async function yarimKalaniKapat(
  durum: UygulamaDurumu, geriYukle: (yedek: string) => Promise<void>, saat: () => Date = () => new Date(),
): Promise<YarimKalanSonucu> {
  const sonuc = (s: UygulamaSonucu['sonuc'], hata: string): UygulamaSonucu => ({
    commit: durum.istek.commit, surum: durum.surum, sonuc: s, adim: durum.adim, hata, baslangic: durum.baslangic, bitis: saat().toISOString(),
  });
  const kesildi = 'Güncelleyici uygulama sırasında kapandı';
  if (durum.adim !== 'goc' && durum.adim !== 'acilis') {
    return { sonuc: sonuc('basarisiz', `${kesildi}; veritabanı değişmedi, eski sürüm açıldı.`), eskiAcilsin: true };
  }
  if (durum.yedek === null) {
    return { sonuc: sonuc('basarisiz', `${kesildi}; yedek yolu bilinmiyor, sunucu kapalı bırakıldı. Elle geri yükleme gerekir.`), eskiAcilsin: false };
  }
  try {
    await geriYukle(durum.yedek);
  } catch (hata) {
    return { sonuc: sonuc('basarisiz', `${kesildi}; yedek geri yüklenemedi, sunucu kapalı bırakıldı: ${hataMetni(hata)}`), eskiAcilsin: false };
  }
  return { sonuc: sonuc('geri-alindi', `${kesildi}; yedek geri yüklendi, eski sürüm açıldı.`), eskiAcilsin: true };
}

// Alt süreçler kendi `.env`'lerini okur: güncelleyicinin TMIV2_ değişkenleri geçerse dosyayla çelişki sayılıp süreç açılmaz
// (araclar/ortam.ts). Dosya yoksa (değişkenler servis ortamında) olduğu gibi geçer.
export function altSurecOrtami(ortam: NodeJS.ProcessEnv, envVar: boolean, ek: Record<string, string> = {}): NodeJS.ProcessEnv {
  const sade = envVar ? Object.fromEntries(Object.entries(ortam).filter(([ad]) => !ad.toUpperCase().startsWith('TMIV2_'))) : { ...ortam };
  return { ...sade, ...ek };
}

// Sunucu derlenmiş istemciyi de telefonların bağlandığı kapıdan verir (E-19; eskiden ayrı `vite preview` süreci vardı).
export const SUNUCU_ARGUMANLARI: readonly string[] = ['--import', './araclar/ortam-yukle.ts', 'sunucu/ana.ts', '--arayuz'];

// Fabrika ağında internet yok (kart #1562): bağımlılıklar yalnız paketin taşıdığı önbellekten kurulur, npm kayıt adresine
// hiç gidilmez. Önbellek taşımayan (eski) paket bu adımda reddedilir; sistem değişmez.
export function npmKurulumArgumanlari(npm: string, klasor: string, varMi: (yol: string) => boolean = existsSync): string[] {
  const onbellek = join(klasor, NPM_ONBELLEGI);
  if (!varMi(onbellek)) throw new Error(`Pakette npm önbelleği yok (${NPM_ONBELLEGI}); internetsiz kurulamaz. Paketi güncel paket-yap ile yeniden üretin.`);
  return [npm, 'ci', '--offline', '--cache', onbellek, '--no-audit', '--no-fund'];
}

// pg_restore ve psql pg_dump'ın yanındadır (aynı PostgreSQL kurulumu). TMIV2_PG_DUMP boşsa üçü de PATH'ten.
export function pgAraci(pgDump: string, ad: 'pg_restore' | 'psql'): string {
  const yol = pgDump.includes('\\') ? win32 : posix;
  if (!pgDump.includes('/') && !pgDump.includes('\\')) return ad;
  return yol.join(yol.dirname(pgDump), yol.basename(pgDump).replace(/pg_dump/i, ad));
}

// Geri yükleme tek transaction'dır ve şemadaki her nesneyi hem silerken hem yeniden kurarken kilitler; kilitler transaction
// bitene dek sunucunun ortak kilit tablosunda durur (max_locks_per_transaction x (max_connections + max_prepared_transactions)).
// Ölçüm (PostgreSQL 16, 499 göçlü boş şema, 1783 pg_class satırı, 4529 döküm girdisi): silme 11674, yükleme 8223, birlikte
// 19891 kilit; varsayılan ayarın sığası 6400'dür. Katsayılar bu ölçümün üstünde kalacak biçimde yuvarlandı: şema büyüdükçe
// ihtiyaç da nesne sayısıyla büyür. Tahmin tutmasa bile transaction hata verip geri alınır; tahmin yalnız işe başlamadan
// açık iletiyle durmak içindir.
export const SINIF_BASINA_KILIT = 12;
export const DOKUM_GIRDISI_BASINA_KILIT = 5;
const KILIT_PAYI = 1.25;
const EN_AZ_KILIT_AYARI = 128;

export interface KilitDurumu {
  maxLocks: number;
  baglanti: number;
  hazirlanan: number;
  kullanilan: number;
}

export function geriYuklemeKilidi(sinifSayisi: number, dokumGirdisi: number): number {
  return Math.max(SINIF_BASINA_KILIT * sinifSayisi, DOKUM_GIRDISI_BASINA_KILIT * dokumGirdisi);
}

// Sığa yetmiyorsa veritabanına dokunmadan önce söylenecek ileti; yetiyorsa null. Önerilen değer ikinin kuvvetine yuvarlanır.
export function kilitYetersizligi(gerekli: number, d: KilitDurumu): string | null {
  const yuva = d.baglanti + d.hazirlanan;
  const bos = d.maxLocks * yuva - d.kullanilan;
  if (bos >= gerekli) return null;
  let oneri = EN_AZ_KILIT_AYARI;
  while (oneri * yuva < gerekli * KILIT_PAYI + d.kullanilan) oneri *= 2;
  return `Geri yükleme için PostgreSQL kilit tablosu yetmiyor: tahmini ${String(gerekli)} kilit gerekli, boş ${String(Math.max(bos, 0))} `
    + `(max_locks_per_transaction ${String(d.maxLocks)} x ${String(yuva)} bağlantı yuvası, kullanılan ${String(d.kullanilan)}). `
    + `postgresql.conf'ta max_locks_per_transaction = ${String(oneri)} yazıp PostgreSQL servisini yeniden başlatın (kurulum/yedek.md). Veritabanına dokunulmadı.`;
}

// Tahmin tutmayıp transaction kilit tablosunda düşerse (53200) aynı yol gösterilir; ipucu satırı ayar adını her dilde taşır.
export function kilitHatasiMi(ileti: string): boolean {
  return /max_locks_per_transaction|out of shared memory/i.test(ileti);
}

type GocKimligi = { kullanici: string; parola: string };

function psqlArgumanlari(ortam: ReturnType<typeof yedekOrtamiOku>, goc: GocKimligi): string[] {
  return [
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', `--host=${ortam.pg.host}`, `--port=${String(ortam.pg.port)}`,
    `--username=${goc.kullanici}`, `--dbname=${ortam.pg.veritabani}`, '--no-password',
  ];
}

// Şemanın bugünkü nesne sayısı ve sunucunun kilit sığası; göç kullanıcısı bunları süper kullanıcı olmadan okuyabilir.
async function kilitDurumuOku(
  ortam: ReturnType<typeof yedekOrtamiOku>, goc: GocKimligi, cwd: string,
): Promise<KilitDurumu & { sinif: number }> {
  const sorgu = `SELECT current_setting('max_locks_per_transaction'), current_setting('max_connections'),
    current_setting('max_prepared_transactions'), (SELECT count(*) FROM pg_locks),
    (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace)`;
  const cikti = await calistir(pgAraci(ortam.pgDump.dosya, 'psql'), [...psqlArgumanlari(ortam, goc), '-A', '-t', '-F', ',', '-c', sorgu], {
    cwd, env: { ...altSurecOrtami(process.env, true), PGPASSWORD: goc.parola },
  }, true);
  const [maxLocks, baglanti, hazirlanan, kullanilan, sinif] = cikti.trim().split(',').map(Number);
  const sayilar = [maxLocks, baglanti, hazirlanan, kullanilan, sinif];
  if (sayilar.some((x) => x === undefined || !Number.isFinite(x))) throw new Error(`Kilit ayarı okunamadı: ${cikti.trim().slice(0, 200)}`);
  return { maxLocks: maxLocks!, baglanti: baglanti!, hazirlanan: hazirlanan!, kullanilan: kullanilan!, sinif: sinif! };
}

// Güncelleyici göçten önce de sorar: geri alınamayacak göç başlamasın. Döküm girdisi verilmezse ihtiyaç bugünkü şemadan
// tahmin edilir (güncelleyicinin yedeği bugünkü şemanın kendisidir).
export async function geriYuklemeKilidiniDenetle(
  ortam: ReturnType<typeof yedekOrtamiOku>, goc: GocKimligi, cwd: string, dokumGirdisi = 0,
): Promise<void> {
  if (goc.kullanici === '') throw new Error('Göç kullanıcısı tanımlı değil (TMIV2_PG_GOC_USER); yedek geri yüklenemez.');
  const d = await kilitDurumuOku(ortam, goc, cwd);
  const engel = kilitYetersizligi(geriYuklemeKilidi(d.sinif, dokumGirdisi), d);
  if (engel !== null) throw new Error(engel);
}

// Yedek tabloların sahibi (göç kullanıcısı) olarak, tek transaction'da: şema boşaltılır, yedek yüklenir. Hata olursa
// hiçbir şey değişmez. Kilit tablosu yetmeyecekse (1746 a) veritabanına dokunmadan ayarı söyleyerek durur.
// Varsayılan yetkiler role bağlıdır (araclar/vt/kurulum.sql), şemayla gitmez; şema yetkisi yedektedir.
// Süper kullanıcı gerekmez: şemanın sahibi göç kullanıcısıdır. Şifreli yedek (145 a) önce geçici dosyaya çözülür; şifreleme
// öncesinden kalan düz yedek olduğu gibi alınır. Geçici dosyalar her durumda silinir.
export async function yedegiGeriYukle(
  ortam: ReturnType<typeof yedekOrtamiOku>, goc: GocKimligi, yedek: string, cwd: string,
): Promise<void> {
  if (goc.kullanici === '') throw new Error('Göç kullanıcısı tanımlı değil (TMIV2_PG_GOC_USER); yedek geri yüklenemez.');
  const betik = `${yedek}.geri.sql`;
  const bosalt = `${yedek}.bosalt.sql`;
  const cozulmus = `${yedek}.cozulmus`;
  const pgOrtami = { cwd, env: { ...altSurecOrtami(process.env, true), PGPASSWORD: goc.parola } };
  try {
    let kaynak = yedek;
    if (await yedekSifreliMi(yedek)) {
      if (ortam.anahtar.durum !== 'tamam') throw new Error(`Yedek şifreli; ${ortam.anahtar.ileti}`);
      await rm(cozulmus, { force: true });
      await yedekSifresiniCoz(ortam.anahtar.anahtar, yedek, cozulmus);
      kaynak = cozulmus;
    }
    const liste = await calistir(pgAraci(ortam.pgDump.dosya, 'pg_restore'), ['--list', kaynak], { cwd, env: process.env }, true);
    const girdi = liste.split(/\r?\n/).filter((s) => s.trim() !== '' && !s.startsWith(';')).length;
    await geriYuklemeKilidiniDenetle(ortam, goc, cwd, girdi);
    await calistir(pgAraci(ortam.pgDump.dosya, 'pg_restore'), ['--no-owner', `--file=${betik}`, kaynak], { cwd, env: process.env });
    await writeFile(bosalt, 'DROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\n');
    try {
      await calistir(pgAraci(ortam.pgDump.dosya, 'psql'), [...psqlArgumanlari(ortam, goc), '-1', `--file=${bosalt}`, `--file=${betik}`], pgOrtami);
    } catch (hata) {
      const ileti = hata instanceof Error ? hata.message : String(hata);
      if (!kilitHatasiMi(ileti)) throw hata;
      throw new Error(`Geri yükleme PostgreSQL kilit tablosu dolduğu için geri alındı; veritabanı değişmedi. postgresql.conf'ta `
        + `max_locks_per_transaction değerini artırıp (kurulum/yedek.md) PostgreSQL servisini yeniden başlatın. Ayrıntı: ${ileti}`);
    }
  } finally {
    await rm(betik, { force: true });
    await rm(bosalt, { force: true });
    await rm(cozulmus, { force: true });
  }
}

// `topla` verilirse standart çıktı ekrana değil sonuca gider (psql sorgu cevabı, pg_restore listesi).
function calistir(komut: string, argumanlar: readonly string[], secenek: { cwd: string; env: NodeJS.ProcessEnv }, topla = false): Promise<string> {
  return new Promise((coz, reddet) => {
    const surec = spawn(komut, argumanlar, { cwd: secenek.cwd, env: secenek.env, stdio: ['ignore', topla ? 'pipe' : 'inherit', 'pipe'], windowsHide: true });
    let cikti = '';
    if (topla) { surec.stdout?.setEncoding('utf8'); surec.stdout?.on('data', (parca: string) => { cikti += parca; }); }
    let hata = '';
    surec.stderr?.setEncoding('utf8');
    surec.stderr?.on('data', (parca: string) => {
      process.stderr.write(parca);
      if (hata.length < 4000) hata += parca;
    });
    surec.on('error', (h) => { reddet(new Error(`${basename(komut)} başlatılamadı: ${h.message}`)); });
    surec.on('close', (kod) => {
      if (kod === 0) { coz(cikti); return; }
      const satir = hata.split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '').at(-1) ?? '';
      reddet(new Error(`${basename(komut)} ${argumanlar.filter((a) => !a.startsWith('-')).slice(-1).join('')} hata verdi (çıkış ${String(kod)})${satir === '' ? '' : `: ${satir}`}`));
    });
  });
}

// Ekrandaki sürüm adı derlemeye buradan girer (istemci/vite.config.ts); adsız sürümde package.json sürümü kalır.
export function derlemeOrtami(surum: CalisanSurum): Record<string, string> {
  return {
    ...(surum.commit === null ? {} : { TMIV2_COMMIT: surum.commit }),
    ...(surum.surum === null ? {} : { TMIV2_SURUM: surum.surum }),
  };
}

// Tek satır, sonunda satır sonu: yarıda kesilen yazım yalnız kendi satırını bozar, okuyan onu atlar.
export function gecmisSatiri(sonuc: UygulamaSonucu, eski: CalisanSurum): string {
  const kayit: GecmisKaydi = { ...sonuc, onceki: surumEtiketi(eski) };
  return `${JSON.stringify(kayit)}\n`;
}

async function jsonYaz(yol: string, deger: unknown): Promise<void> {
  // Önce geçici dosya, sonra taşıma: sunucu yarım dosya okumaz.
  await writeFile(`${yol}.yaziliyor`, JSON.stringify(deger));
  await rename(`${yol}.yaziliyor`, yol);
}

interface Surecler { sunucu: ChildProcess }

export interface GuncelleyiciSecenekleri {
  kok: string;
  dizin: string;
  anahtar: string;
  port: number;
}

const BEKLEME_MS = 3000;
const SAGLIK_SURESI_MS = 3 * 60 * 1000;
const DURMA_SURESI_MS = 30 * 1000;

export class Guncelleyici {
  private surecler: Surecler | null = null;
  private kapaniyor = false;
  private readonly s: GuncelleyiciSecenekleri;
  private readonly envVar: boolean;
  private readonly goc: { kullanici: string; parola: string };

  constructor(s: GuncelleyiciSecenekleri, envDosyasi: string | null) {
    this.s = s;
    this.envVar = envDosyasi !== null;
    const dosya = envDosyasi === null ? {} : parseEnv(readFileSync(envDosyasi, 'utf8'));
    // Göç kimliği bu süreçte ortama alınmaz (sunucu süreci onu taşımaz); yalnız geri yüklemede psql'e verilir.
    this.goc = {
      kullanici: (dosya['TMIV2_PG_GOC_USER'] ?? process.env['TMIV2_PG_GOC_USER'] ?? '').trim(),
      parola: dosya['TMIV2_PG_GOC_PASSWORD'] ?? process.env['TMIV2_PG_GOC_PASSWORD'] ?? '',
    };
  }

  private yol(ad: string): string { return join(this.s.dizin, ad); }
  surumKlasoru(commit: string): string { return join(this.s.dizin, SURUMLER_KLASORU, commit); }

  // İlk kurulum git ağacıysa sürümü git'ten okunur; değilse bilinmez.
  private kokSurumu(): CalisanSurum {
    try {
      const git = (a: string[]) => execFileSync('git', a, { cwd: this.s.kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return { commit: git(['rev-parse', 'HEAD']), surum: null, tarih: new Date(git(['show', '-s', '--format=%cI', 'HEAD'])).toISOString() };
    } catch {
      return { commit: null, surum: null, tarih: null };
    }
  }

  // Çalışan sürüm: güncelleyicinin kurduğu son sürüm klasörü; yoksa ilk kurulum ağacı.
  async aktif(): Promise<{ klasor: string; surum: CalisanSurum }> {
    const metin = await readFile(this.yol(CALISAN_SURUM_DOSYASI), 'utf8').catch(() => null);
    const kayit = metin === null ? null : calisanSurumSemasi.safeParse(JSON.parse(metin));
    if (kayit?.success && kayit.data.commit !== null && existsSync(join(this.surumKlasoru(kayit.data.commit), 'package.json'))) {
      return { klasor: this.surumKlasoru(kayit.data.commit), surum: kayit.data };
    }
    return { klasor: this.s.kok, surum: this.kokSurumu() };
  }

  private envKopyala(klasor: string): void {
    if (klasor === this.s.kok) return;
    const kaynak = envYolu(this.s.kok, () => anaAgacKoku(this.s.kok), existsSync);
    if (kaynak !== null) copyFileSync(kaynak, join(klasor, '.env'));
  }

  private async derle(klasor: string, surum: CalisanSurum): Promise<void> {
    const vite = binYolu(klasor, 'vite');
    const ortam = altSurecOrtami(process.env, this.envVar, derlemeOrtami(surum));
    for (const ayar of ['arkon/vite.config.ts', 'istemci/vite.config.ts']) {
      await calistir(process.execPath, [vite, 'build', '--config', ayar], { cwd: klasor, env: ortam });
    }
  }

  // Süreçler kabuksuz açılır: Windows'ta kabuk ara süreci kapanınca sunucu sahipsiz kalıyordu (kurulum/devir.md).
  async ac(klasor: string, surum: CalisanSurum, derlensin: boolean): Promise<void> {
    this.envKopyala(klasor);
    if (derlensin) await this.derle(klasor, surum);
    const ortam = altSurecOrtami(process.env, this.envVar);
    const sunucu = spawn(process.execPath, [...SUNUCU_ARGUMANLARI], { cwd: klasor, env: ortam, stdio: 'inherit' });
    const surecler = { sunucu };
    this.surecler = surecler;
    // Beklenmedik düşüşte güncelleyici de kapanır, bekçi yeniden açar; uygulama sırasındaki durdurma bu yolu tetiklemez.
    sunucu.on('exit', () => {
      if (this.surecler === surecler && !this.kapaniyor) {
        console.error('Sunucu kapandı; güncelleyici de kapanıyor.');
        void this.kapat(1);
      }
    });
    await jsonYaz(this.yol(CALISAN_SURUM_DOSYASI), surum);
  }

  async durdur(): Promise<void> {
    const surecler = this.surecler;
    this.surecler = null;
    if (surecler === null) return;
    await Promise.all([surecler.sunucu].map((s) => new Promise<void>((coz) => {
      if (s.exitCode !== null || s.signalCode !== null) { coz(); return; }
      const sure = setTimeout(() => { s.kill('SIGKILL'); }, DURMA_SURESI_MS);
      s.once('exit', () => { clearTimeout(sure); coz(); });
      s.kill('SIGTERM');
    })));
  }

  private async saglikBekle(): Promise<void> {
    const son = Date.now() + SAGLIK_SURESI_MS;
    while (Date.now() < son) {
      const s = this.surecler;
      if (s === null || s.sunucu.exitCode !== null) throw new Error('Yeni sürümün sunucusu açılırken kapandı.');
      const cevap = await fetch(`http://127.0.0.1:${String(this.s.port)}/api/saglik`).catch(() => null);
      if (cevap?.ok === true) return;
      await new Promise((coz) => setTimeout(coz, 2000));
    }
    throw new Error(`Yeni sürümün sağlık ucu ${String(SAGLIK_SURESI_MS / 60_000)} dakikada cevap vermedi.`);
  }

  private async calisanGocler(klasor: string): Promise<string[]> {
    return (await readdir(join(klasor, 'sunucu', 'gocler'))).filter((ad) => ad.endsWith('.sql'));
  }

  adimlar(istek: UygulamaIstegi, eski: { klasor: string; surum: CalisanSurum }, yedekAlindi: (yol: string) => void = () => {}): UygulamaAdimlari {
    const yeniKlasor = this.surumKlasoru(istek.commit);
    let yeni: CalisanSurum | null = null;
    let paket: { yol: string; yukBasi: number } | null = null;
    let yedek: string | null = null;
    let yedekOrtami = yedekOrtamiOku();
    const npm = npmCliBul();
    return {
      dogrula: async () => {
        const d = await saklananPaketiDogrula(this.s.dizin, this.s.anahtar, istek.commit);
        const red = uygulamaReddi(d.bildirim, { ...eski.surum, gocler: await this.calisanGocler(eski.klasor) });
        if (red !== null) throw new Error(UYGULAMA_REDDI_ILETISI[red]);
        if (npm === null) throw new Error('npm bulunamadı (npm-cli.js node\'un yanında da yok); güncelleyiciyi "npm run baslat" ile açın.');
        // Sistem Ayarları'nda seçilen klasör, sunucunun güncelleme klasörüne yazdığı dosyadan okunur; seçim yoksa TMIV2_YEDEK_DIZINI.
        yedekOrtami = { ...yedekOrtami, dizin: await seciliYedekDizini(this.s.dizin) };
        const yedekDizini = yedekOrtami.dizin;
        if (yedekDizini === null || !isAbsolute(yedekDizini) || !(await stat(yedekDizini).catch(() => null))?.isDirectory()) {
          throw new Error('Yedek kapalı (yedek klasörü seçilmedi, TMIV2_YEDEK_DIZINI de yok); yedeksiz güncelleme yapılmaz.');
        }
        paket = d;
        yeni = { commit: d.bildirim.commit, surum: d.bildirim.surum, tarih: d.bildirim.tarih };
        return d.bildirim.surum;
      },
      hazirla: async () => {
        if (paket === null || yeni === null) throw new Error('Paket doğrulanmadı.');
        // Önceki yarım denemenin artığı silinir; klasör yalnız tamamlanınca adına taşınır.
        const yarim = `${yeniKlasor}.yarim`;
        await rm(yarim, { recursive: true, force: true });
        await rm(yeniKlasor, { recursive: true, force: true });
        await mkdir(yarim, { recursive: true });
        const tmip = await readFile(paket.yol);
        const sayi = tarAc(tmip.subarray(paket.yukBasi), yarim);
        console.log(`Güncelleme: ${String(sayi)} dosya açıldı.`);
        this.envKopyala(yarim);
        await calistir(process.execPath, npmKurulumArgumanlari(npm ?? '', yarim), {
          cwd: yarim, env: altSurecOrtami(process.env, this.envVar),
        });
        // Önbellek kurulumdan sonra gerekmez; her sürüm klasöründe yer tutmasın.
        await rm(join(yarim, NPM_ONBELLEGI), { recursive: true, force: true });
        await this.derle(yarim, yeni);
        await rename(yarim, yeniKlasor);
        // Yedeksiz göç olmaz: yedeğe yer yoksa sunucu durdurulmadan güncelleme burada biter.
        await yedekYeriniDenetle(yedekOrtami.dizin ?? '', yedekOrtami.pg.veritabani);
      },
      durdur: () => this.durdur(),
      yedekle: async () => {
        const dosya = await yedekAl(yedekOrtami, yedekOrtami.dizin ?? '', 'elle', new Date());
        yedek = join(yedekOrtami.dizin ?? '', dosya.ad);
        yedekAlindi(yedek);
        console.log(`Güncelleme: yedek alındı: ${yedek}`);
        // Göç bozulursa bu yedek geri yüklenecek: yüklenemeyecekse göç hiç başlamaz, eski sürüm açılır.
        await geriYuklemeKilidiniDenetle(yedekOrtami, this.goc, this.s.dizin);
      },
      gocle: async () => {
        await calistir(process.execPath, ['--import', './araclar/ortam-yukle-goc.ts', 'sunucu/cekirdek/goc-calistir.ts'], {
          cwd: yeniKlasor, env: altSurecOrtami(process.env, this.envVar),
        });
      },
      yeniyiAc: async () => {
        if (yeni === null) throw new Error('Paket doğrulanmadı.');
        await this.ac(yeniKlasor, yeni, false);
        try {
          await this.saglikBekle();
        } catch (hata) {
          await this.durdur();
          throw hata;
        }
      },
      geriYukle: async () => {
        if (yedek === null) throw new Error('Yedek yok.');
        await this.geriYukle(yedekOrtami, yedek);
      },
      eskiyiAc: () => this.ac(eski.klasor, eski.surum, false),
    };
  }

  private geriYukle(ortam: ReturnType<typeof yedekOrtamiOku>, yedek: string): Promise<void> {
    return yedegiGeriYukle(ortam, this.goc, yedek, this.s.dizin);
  }

  async istegiAl(): Promise<UygulamaIstegi | null> {
    const yol = this.yol(UYGULAMA_ISTEGI_DOSYASI);
    const metin = await readFile(yol, 'utf8').catch(() => null);
    if (metin === null) return null;
    let istek: UygulamaIstegi | null = null;
    try {
      const sonuc = uygulamaIstegiSemasi.safeParse(JSON.parse(metin));
      if (sonuc.success) istek = sonuc.data;
    } catch { /* sunucu yazarken okunmuş olabilir; sonraki turda yeniden okunur */ }
    // İstek bir kez işlenir: güncelleyici uygulama sırasında düşerse açılışta yeniden denenmez. İşaret istek silinmeden yazılır:
    // sunucu arada hiçbir an bu sürümü "boşta" görüp klasörünü ya da paketini silemez.
    if (istek !== null) {
      await jsonYaz(this.yol(UYGULANIYOR_DOSYASI), istek);
      await rm(yol, { force: true });
    }
    return istek;
  }

  private async sonucuYaz(sonuc: UygulamaSonucu, eski: CalisanSurum): Promise<void> {
    await jsonYaz(this.yol(UYGULAMA_SONUCU_DOSYASI), sonuc);
    // Geçmiş yazılamazsa güncelleme bozulmuş sayılmaz: sonuç dosyası yazıldı, sürüm çalışıyor.
    await appendFile(this.yol(UYGULAMA_GECMISI_DOSYASI), gecmisSatiri(sonuc, eski))
      .catch((hata: unknown) => { console.error(`Uygulama geçmişi yazılamadı: ${hataMetni(hata)}`); });
  }

  async uygula(istek: UygulamaIstegi): Promise<void> {
    const eski = await this.aktif();
    console.log(`Güncelleme başladı: ${istek.commit}`);
    const durum: UygulamaDurumu = {
      istek, surum: istek.commit.slice(0, 7), adim: 'dogrula', eski, yedek: null, baslangic: new Date().toISOString(), elle: false,
    };
    const kaydet = (): Promise<void> => jsonYaz(this.yol(UYGULAMA_DURUMU_DOSYASI), durum);
    // Dosyanın zamanı yenilenir, içeriği değil: bekçi yalnız zamana bakar.
    const yenileyici = setInterval(() => {
      const simdi = new Date();
      void utimes(this.yol(UYGULANIYOR_DOSYASI), simdi, simdi).catch(() => undefined);
    }, ISARET_YENILEME_MS);
    let sonuc: UygulamaSonucu;
    try {
      sonuc = await paketiUygula(istek, this.adimlar(istek, eski, (yol) => { durum.yedek = yol; }), undefined, async (adim, surum) => {
        durum.adim = adim;
        durum.surum = surum;
        await kaydet();
      });
      await this.sonucuYaz(sonuc, eski.surum);
      if (this.surecler === null) {
        // Geri yükleme bozuldu, sunucu kapalı: bekçinin yeniden açışı da yarım şemayla eski ya da yeni kodu açmasın.
        await jsonYaz(this.yol(CALISAN_SURUM_DOSYASI), eski.surum);
        await jsonYaz(this.yol(UYGULAMA_DURUMU_DOSYASI), { ...durum, elle: true });
      } else {
        await rm(this.yol(UYGULAMA_DURUMU_DOSYASI), { force: true });
      }
    } finally {
      clearInterval(yenileyici);
      await rm(this.yol(UYGULANIYOR_DOSYASI), { force: true });
    }
    console.log(`Güncelleme bitti: ${sonuc.sonuc}${sonuc.hata === null ? '' : ` (${sonuc.adim ?? ''}: ${sonuc.hata})`}`);
    // Sunucu kapalı bırakıldıysa (geri yükleme bozuldu) güncelleyici de durur: elle müdahale gerekir.
    if (this.surecler === null) await this.kapat(1);
  }

  // Önceki güncelleyici uygulama ortasında öldürüldüyse durum dosyası kalır. Dönen değer açılacak sürümdür; null ise sunucu açılmaz.
  async yarimKalaniBitir(): Promise<{ klasor: string; surum: CalisanSurum } | null> {
    const metin = await readFile(this.yol(UYGULAMA_DURUMU_DOSYASI), 'utf8').catch(() => null);
    if (metin === null) return this.aktif();
    let durum: UygulamaDurumu | null = null;
    try {
      const okunan = uygulamaDurumuSemasi.safeParse(JSON.parse(metin));
      if (okunan.success) durum = okunan.data;
    } catch { /* aşağıda */ }
    if (durum === null) {
      console.error(`${UYGULAMA_DURUMU_DOSYASI} okunamadı; önceki güncellemenin hangi adımda kaldığı bilinmiyor. Sunucu açılmadı: veritabanını `
        + 'kontrol edin (gerekirse yedeği elle geri yükleyin, kurulum/yedek.md), sonra dosyayı silin.');
      return null;
    }
    if (durum.elle) {
      console.error(`Önceki güncelleme geri yüklenemedi; sunucu açılmadı. Yedek elle geri yüklenip (${durum.yedek ?? 'yedek yolu bilinmiyor'}, `
        + `kurulum/yedek.md) ${this.yol(UYGULAMA_DURUMU_DOSYASI)} silinince açılır.`);
      return null;
    }
    console.error(`Önceki güncelleme ${durum.adim} adımında kesilmiş (${durum.surum}); kapatılıyor.`);
    const { sonuc, eskiAcilsin } = await yarimKalaniKapat(durum, (yedek) => this.geriYukle(yedekOrtamiOku(), yedek));
    await this.sonucuYaz(sonuc, durum.eski.surum);
    // Yeni sürüm açılışta kesildiyse çalışan sürüm dosyası onu gösterebilir; eski sürüm geri yazılır.
    await jsonYaz(this.yol(CALISAN_SURUM_DOSYASI), durum.eski.surum);
    if (!eskiAcilsin) {
      await jsonYaz(this.yol(UYGULAMA_DURUMU_DOSYASI), { ...durum, elle: true });
      console.error(sonuc.hata ?? '');
      return null;
    }
    await rm(this.yol(UYGULAMA_DURUMU_DOSYASI), { force: true });
    console.error(`Güncelleme kapatıldı: ${sonuc.sonuc}. ${sonuc.hata ?? ''}`);
    return durum.eski;
  }

  async baslat(): Promise<void> {
    await mkdir(join(this.s.dizin, SURUMLER_KLASORU), { recursive: true });
    // Önceki güncelleyici uygulama ortasında düştüyse işareti kalır; istek yeniden denenmediği için işaret de artıktır.
    await rm(this.yol(UYGULANIYOR_DOSYASI), { force: true });
    const acilacak = await this.yarimKalaniBitir();
    if (acilacak === null) {
      process.exitCode = 1;
      return;
    }
    await jsonYaz(this.yol(GUNCELLEYICI_DOSYASI), { pid: process.pid });
    const { klasor, surum } = acilacak;
    console.log(`Güncelleyici: ${klasor} açılıyor (${surum.commit ?? 'commit bilinmiyor'}).`);
    await this.ac(klasor, surum, true);
    for (;;) {
      await new Promise((coz) => setTimeout(coz, BEKLEME_MS));
      if (this.kapaniyor) return;
      const istek = await this.istegiAl();
      if (istek !== null) await this.uygula(istek);
    }
  }

  async kapat(kod: number): Promise<void> {
    if (this.kapaniyor) return;
    this.kapaniyor = true;
    await this.durdur();
    await rm(this.yol(GUNCELLEYICI_DOSYASI), { force: true });
    process.exit(kod);
  }
}

// `npm run baslat`: güncelleme klasörü tanımlıysa güncelleyiciyle açar; değilse null döner, eski davranış sürer.
export function guncelleyiciKur(kok: string): Guncelleyici | null {
  const envDosyasi = ortamiYukle(kok, process.env, undefined, GOC_KIMLIGI);
  const dizin = process.env['TMIV2_GUNCELLEME_DIZINI']?.trim() ?? '';
  const anahtar = process.env['TMIV2_GUNCELLEME_ANAHTARI']?.trim() ?? '';
  if (dizin === '' || anahtar === '') return null;
  if (!isAbsolute(dizin) || !existsSync(dizin)) throw new Error(`TMIV2_GUNCELLEME_DIZINI mutlak yol olmalı ve klasör var olmalı: ${dizin}`);
  return new Guncelleyici({ kok, dizin, anahtar, port: Number(process.env['TMIV2_PORT'] ?? '4100') }, envDosyasi);
}
