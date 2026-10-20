import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, posix, win32 } from 'node:path';
import { parseEnv } from 'node:util';
import {
  CALISAN_SURUM_DOSYASI, GUNCELLEYICI_DOSYASI, SURUMLER_KLASORU, UYGULAMA_HATASI_EN_UZUN, UYGULAMA_ISTEGI_DOSYASI, UYGULAMA_REDDI_ILETISI,
  UYGULAMA_SONUCU_DOSYASI, UYGULANIYOR_DOSYASI, calisanSurumSemasi, saklananPaketiDogrula, uygulamaIstegiSemasi, uygulamaReddi, yedekAl,
  yedekDizini as seciliYedekDizini, yedekOrtamiOku, yedekSifreliMi, yedekSifresiniCoz, yedekYeriniDenetle,
  type CalisanSurum, type UygulamaIstegi, type UygulamaSonucu,
} from '../sunucu/moduller/ayarlar/disari.ts';
import { GOC_KIMLIGI, anaAgacKoku, envYolu, ortamiYukle } from './ortam.ts';
import { binYolu } from './paket-bin.ts';
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
export async function paketiUygula(istek: UygulamaIstegi, a: UygulamaAdimlari, saat: () => Date = () => new Date()): Promise<UygulamaSonucu> {
  const baslangic = saat().toISOString();
  let surum = istek.commit.slice(0, 7);
  let adim: Adim = 'dogrula';
  const sonuc = (s: UygulamaSonucu['sonuc'], hata: string | null): UygulamaSonucu => ({
    commit: istek.commit, surum, sonuc: s, adim: s === 'kuruldu' ? null : adim, hata, baslangic, bitis: saat().toISOString(),
  });

  try {
    surum = await a.dogrula();
    adim = 'hazirla';
    await a.hazirla();
  } catch (hata) {
    return sonuc('basarisiz', hataMetni(hata));
  }

  try {
    adim = 'durdur';
    await a.durdur();
    adim = 'yedek';
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
    adim = 'goc';
    await a.gocle();
    adim = 'acilis';
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

// Yedek tabloların sahibi (göç kullanıcısı) olarak, tek transaction'da: şema boşaltılır, yedek yüklenir. Hata olursa
// hiçbir şey değişmez. Varsayılan yetkiler role bağlıdır (araclar/vt/kurulum.sql), şemayla gitmez; şema yetkisi yedektedir.
// Süper kullanıcı gerekmez: şemanın sahibi göç kullanıcısıdır. Şifreli yedek (145 a) önce geçici dosyaya çözülür; şifreleme
// öncesinden kalan düz yedek olduğu gibi alınır. Geçici dosyalar her durumda silinir.
export async function yedegiGeriYukle(
  ortam: ReturnType<typeof yedekOrtamiOku>, goc: { kullanici: string; parola: string }, yedek: string, cwd: string,
): Promise<void> {
  if (goc.kullanici === '') throw new Error('Göç kullanıcısı tanımlı değil (TMIV2_PG_GOC_USER); yedek geri yüklenemez.');
  const betik = `${yedek}.geri.sql`;
  const bosalt = `${yedek}.bosalt.sql`;
  const cozulmus = `${yedek}.cozulmus`;
  try {
    let kaynak = yedek;
    if (await yedekSifreliMi(yedek)) {
      if (ortam.anahtar.durum !== 'tamam') throw new Error(`Yedek şifreli; ${ortam.anahtar.ileti}`);
      await rm(cozulmus, { force: true });
      await yedekSifresiniCoz(ortam.anahtar.anahtar, yedek, cozulmus);
      kaynak = cozulmus;
    }
    await calistir(pgAraci(ortam.pgDump.dosya, 'pg_restore'), ['--no-owner', `--file=${betik}`, kaynak], { cwd, env: process.env });
    await writeFile(bosalt, 'DROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\n');
    await calistir(pgAraci(ortam.pgDump.dosya, 'psql'), [
      '-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1', `--host=${ortam.pg.host}`, `--port=${String(ortam.pg.port)}`,
      `--username=${goc.kullanici}`, `--dbname=${ortam.pg.veritabani}`, '--no-password', `--file=${bosalt}`, `--file=${betik}`,
    ], { cwd, env: { ...altSurecOrtami(process.env, true), PGPASSWORD: goc.parola } });
  } finally {
    await rm(betik, { force: true });
    await rm(bosalt, { force: true });
    await rm(cozulmus, { force: true });
  }
}

function calistir(komut: string, argumanlar: readonly string[], secenek: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((coz, reddet) => {
    const surec = spawn(komut, argumanlar, { cwd: secenek.cwd, env: secenek.env, stdio: ['ignore', 'inherit', 'pipe'], windowsHide: true });
    let hata = '';
    surec.stderr.setEncoding('utf8');
    surec.stderr.on('data', (parca: string) => {
      process.stderr.write(parca);
      if (hata.length < 4000) hata += parca;
    });
    surec.on('error', (h) => { reddet(new Error(`${basename(komut)} başlatılamadı: ${h.message}`)); });
    surec.on('close', (kod) => {
      if (kod === 0) { coz(); return; }
      const satir = hata.split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '').at(-1) ?? '';
      reddet(new Error(`${basename(komut)} ${argumanlar.filter((a) => !a.startsWith('-')).slice(-1).join('')} hata verdi (çıkış ${String(kod)})${satir === '' ? '' : `: ${satir}`}`));
    });
  });
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

  private async derle(klasor: string, commit: string | null): Promise<void> {
    const vite = binYolu(klasor, 'vite');
    const ortam = altSurecOrtami(process.env, this.envVar, commit === null ? {} : { TMIV2_COMMIT: commit });
    for (const ayar of ['arkon/vite.config.ts', 'istemci/vite.config.ts']) {
      await calistir(process.execPath, [vite, 'build', '--config', ayar], { cwd: klasor, env: ortam });
    }
  }

  // Süreçler kabuksuz açılır: Windows'ta kabuk ara süreci kapanınca sunucu sahipsiz kalıyordu (kurulum/devir.md).
  async ac(klasor: string, surum: CalisanSurum, derlensin: boolean): Promise<void> {
    this.envKopyala(klasor);
    if (derlensin) await this.derle(klasor, surum.commit);
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

  adimlar(istek: UygulamaIstegi, eski: { klasor: string; surum: CalisanSurum }): UygulamaAdimlari {
    const yeniKlasor = this.surumKlasoru(istek.commit);
    let yeni: CalisanSurum | null = null;
    let paket: { yol: string; yukBasi: number } | null = null;
    let yedek: string | null = null;
    let yedekOrtami = yedekOrtamiOku();
    const npm = process.env['npm_execpath'];
    return {
      dogrula: async () => {
        const d = await saklananPaketiDogrula(this.s.dizin, this.s.anahtar, istek.commit);
        const red = uygulamaReddi(d.bildirim, { ...eski.surum, gocler: await this.calisanGocler(eski.klasor) });
        if (red !== null) throw new Error(UYGULAMA_REDDI_ILETISI[red]);
        if (npm === undefined) throw new Error('npm bulunamadı; güncelleyiciyi "npm run baslat" ile açın.');
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
        await this.derle(yarim, yeni.commit);
        await rename(yarim, yeniKlasor);
        // Yedeksiz göç olmaz: yedeğe yer yoksa sunucu durdurulmadan güncelleme burada biter.
        await yedekYeriniDenetle(yedekOrtami.dizin ?? '', yedekOrtami.pg.veritabani);
      },
      durdur: () => this.durdur(),
      yedekle: async () => {
        const dosya = await yedekAl(yedekOrtami, yedekOrtami.dizin ?? '', 'elle', new Date());
        yedek = join(yedekOrtami.dizin ?? '', dosya.ad);
        console.log(`Güncelleme: yedek alındı: ${yedek}`);
      },
      gocle: () => calistir(process.execPath, ['--import', './araclar/ortam-yukle-goc.ts', 'sunucu/cekirdek/goc-calistir.ts'], {
        cwd: yeniKlasor, env: altSurecOrtami(process.env, this.envVar),
      }),
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

  async uygula(istek: UygulamaIstegi): Promise<void> {
    const eski = await this.aktif();
    console.log(`Güncelleme başladı: ${istek.commit}`);
    let sonuc: UygulamaSonucu;
    try {
      sonuc = await paketiUygula(istek, this.adimlar(istek, eski));
      await jsonYaz(this.yol(UYGULAMA_SONUCU_DOSYASI), sonuc);
    } finally {
      await rm(this.yol(UYGULANIYOR_DOSYASI), { force: true });
    }
    console.log(`Güncelleme bitti: ${sonuc.sonuc}${sonuc.hata === null ? '' : ` (${sonuc.adim ?? ''}: ${sonuc.hata})`}`);
    // Sunucu kapalı bırakıldıysa (geri yükleme bozuldu) güncelleyici de durur: elle müdahale gerekir.
    if (this.surecler === null) await this.kapat(1);
  }

  async baslat(): Promise<void> {
    await mkdir(join(this.s.dizin, SURUMLER_KLASORU), { recursive: true });
    // Önceki güncelleyici uygulama ortasında düştüyse işareti kalır; istek yeniden denenmediği için işaret de artıktır.
    await rm(this.yol(UYGULANIYOR_DOSYASI), { force: true });
    await jsonYaz(this.yol(GUNCELLEYICI_DOSYASI), { pid: process.pid });
    const { klasor, surum } = await this.aktif();
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
