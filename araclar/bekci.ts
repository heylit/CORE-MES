import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOC_KIMLIGI, ortamiYukle } from './ortam.ts';

// Sunucuyu ayakta tutar (`npm run bekci`): `npm run baslat`'ı alt süreç olarak açar, kapanırsa bekleyip yeniden açar. Gerçek Windows
// servisi yönetici yetkisi ve ayrı bir servis sarmalayıcısı ister; bekçi ikisini de istemez. Oturum açılışında başlaması için
// `npm run otomatik-baslat -- kur` Başlangıç klasörüne bir betik koyar (kurulum/servis.md).
const kok = fileURLToPath(new URL('../', import.meta.url));

// Art arda çöküşte bekleme uzar ki bozuk bir kurulum makineyi döngüde yormasın; bu kadar ayakta kalan açılıştan sonra sayaç sıfırlanır.
const ILK_BEKLEME_MS = 5_000;
const EN_UZUN_BEKLEME_MS = 60_000;
export const KARARLI_MS = 10 * 60_000;
const GUNLUK_EN_BUYUK = 10 * 1024 * 1024;

export function beklemeMs(ardArda: number): number {
  return Math.min(EN_UZUN_BEKLEME_MS, ILK_BEKLEME_MS * 2 ** Math.max(0, ardArda - 1));
}

// Donan sunucu kapanmaz, yalnız cevap vermez (kesinti tatbikatı D4, SIGSTOP). Açılıştaki derleme ve göç denetimi payından sonra
// sağlık ucu aralıkla yoklanır; art arda bu kadar cevapsızlıkta süreç ağacı sonlandırılır ve olağan yeniden açılış işler.
// Veritabanı düşükken uç 503 döner: cevap gelmiştir, sunucu yeniden açılmaz (yeniden açmak veritabanını getirmez).
export const ACILIS_PAYI_MS = 3 * 60_000;
export const YOKLAMA_ARALIGI_MS = 30_000;
export const YOKLAMA_SURESI_MS = 5_000;
const CEVAPSIZ_ESIK = 3;

// Güncelleyici (araclar/guncelleyici.ts) uygulama boyunca bu işareti tutar ve dakikada bir zamanını yeniler; o sürede sunucu bilerek
// kapalıdır (yedek, göç, yeni sürümün açılışı) ve ağacı kapatmak göçü yarıda keser. Uzun göç işareti eskitmez; işaret bu paydan eskiyse
// güncelleyici ölmüş ya da takılmış sayılır ve olağan yoklama işler (açılan güncelleyici yarım kalanı kendisi kapatır).
// Ad ayarlar modülündeki sabitle aynıdır (bekci.test.ts denetler); bekçi sunucu kodunu yüklemesin diye ithal edilmez.
export const GUNCELLEME_ISARETI = 'uygulaniyor.json';
export const GUNCELLEME_PAYI_MS = 5 * 60_000;

export function guncellemeSuruyorMu(isaretZamani: number | null, simdi: number): boolean {
  return isaretZamani !== null && simdi - isaretZamani <= GUNCELLEME_PAYI_MS;
}

export interface IzlenenSurec {
  kapandi: Promise<{ kod: number | null; sinyal: string | null }>;
  sonlandir(): void;
}

export interface BekciOrtami {
  baslat(): IzlenenSurec;
  bekle(ms: number): Promise<void>;
  simdi(): number;
  yaz(satir: string): void;
  // Verilmezse yalnız kapanış izlenir.
  yokla?(): Promise<boolean>;
  // Verilmezse güncelleme yoktur (güncelleme klasörü tanımsız).
  guncellemeSuruyor?(): boolean;
}

export class Bekci {
  private durdu = false;
  private readonly o: BekciOrtami;

  constructor(o: BekciOrtami) {
    this.o = o;
  }

  // Kapanış isteği süren açılışı kesmez: sunucu sinyali kendisi alır; bekçi yalnız yeniden açmaz.
  durdur(): void {
    this.durdu = true;
  }

  async calistir(): Promise<void> {
    let ardArda = 0;
    while (!this.durdu) {
      const acilis = this.o.simdi();
      this.o.yaz('Sunucu açılıyor.');
      const surec = this.o.baslat();
      let kapandi = false;
      const izleme = this.izle(surec, () => kapandi || this.durdu);
      const { kod, sinyal } = await surec.kapandi;
      kapandi = true;
      await izleme;
      if (this.durdu) break;
      ardArda = this.o.simdi() - acilis >= KARARLI_MS ? 1 : ardArda + 1;
      const bekleme = beklemeMs(ardArda);
      this.o.yaz(`Sunucu kapandı (${sinyal !== null ? `sinyal ${sinyal}` : `çıkış ${String(kod)}`}); ${String(bekleme / 1000)} sn sonra yeniden açılacak.`);
      await this.o.bekle(bekleme);
    }
    this.o.yaz('Bekçi durdu; sunucu yeniden açılmayacak.');
  }

  private async izle(surec: IzlenenSurec, bitti: () => boolean): Promise<void> {
    const { yokla } = this.o;
    if (yokla === undefined) return;
    await this.o.bekle(ACILIS_PAYI_MS);
    let cevapsiz = 0;
    let guncellemeBildirildi = false;
    while (!bitti()) {
      const cevap = await yokla();
      if (bitti()) return;
      if (this.o.guncellemeSuruyor?.() === true) {
        if (!guncellemeBildirildi) this.o.yaz('Güncelleme sürüyor; bitene kadar cevapsız yoklama sayılmaz.');
        guncellemeBildirildi = true;
        cevapsiz = 0;
      } else {
        guncellemeBildirildi = false;
        cevapsiz = cevap ? 0 : cevapsiz + 1;
      }
      if (cevapsiz >= CEVAPSIZ_ESIK) {
        this.o.yaz(`Sunucu art arda ${String(CEVAPSIZ_ESIK)} yoklamada cevap vermedi; sonlandırılıp yeniden açılacak.`);
        surec.sonlandir();
        return;
      }
      await this.o.bekle(YOKLAMA_ARALIGI_MS);
    }
  }
}

// Yalnız cevabın gelip gelmediğine bakılır, durum koduna değil (yukarıdaki not).
export async function saglikYokla(port: number, sure = YOKLAMA_SURESI_MS): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${String(port)}/api/saglik`, { signal: AbortSignal.timeout(sure) });
    return true;
  } catch {
    return false;
  }
}

// Donan süreç TERM sinyalini işleyemez ve baslat.ts'nin alt süreçleri (sunucu, önizleme) kapıyı tutar: ağacın tamamı zorla kapatılır.
// Windows'ta taskkill ağacı izler; öteki sistemlerde baslat.ts kendi süreç grubunda açılır ve grup sonlandırılır.
function agaciSonlandir(surec: ChildProcess): void {
  if (surec.pid === undefined || surec.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(surec.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-surec.pid, 'SIGKILL');
  } catch {
    surec.kill('SIGKILL');
  }
}

// Bekçi çoğu zaman küçültülmüş pencerede ya da kimse bakmazken koşar: çöküş nedeni konsolla kaybolmasın diye günlük dosyaya da yazılır.
// Depo klasörünün yanına yazılır, içine değil (yedek klasörü gibi).
export function gunlukDosyasi(depoKoku: string): string {
  return path.resolve(depoKoku, '..', 'TMIV2-GUNLUK', 'bekci.log');
}

function dosyayaYaz(dosya: string, metin: string): void {
  try {
    mkdirSync(path.dirname(dosya), { recursive: true });
    if (existsSync(dosya) && statSync(dosya).size > GUNLUK_EN_BUYUK) renameSync(dosya, `${dosya}.1`);
    appendFileSync(dosya, metin);
  } catch {
    // Günlüğe yazılamaması sunucuyu durdurmaz.
  }
}

function isaretZamani(dosya: string): number | null {
  try {
    return statSync(dosya).mtimeMs;
  } catch {
    return null;
  }
}

const BASLANGIC_ADI = 'TMIV2-sunucu.cmd';

// Başlangıç klasörü kullanıcınındır: yazmak yönetici istemez. Kod sayfası UTF-8'e alınır ki Türkçe karakterli klasör adı bozulmasın.
export function baslangicBetigi(depoKoku: string, node: string): string {
  for (const yol of [depoKoku, node]) {
    if (/["%\r\n]/.test(yol)) throw new Error(`Klasör adında " ya da % olamaz: ${yol}`);
  }
  return [
    '@echo off',
    'rem TMI CORE V2: oturum acilinca sunucuyu bekciyle baslatir. Kaldirmak icin: npm run otomatik-baslat -- kaldir',
    'chcp 65001 >nul',
    `cd /d "${depoKoku}"`,
    `start "TMIV2 sunucu" /min "${node}" araclar\\bekci.ts`,
    '',
  ].join('\r\n');
}

export function baslangicKlasoru(env: NodeJS.ProcessEnv): string {
  const appData = env['APPDATA']?.trim() ?? '';
  if (appData === '') throw new Error('APPDATA tanımlı değil; Başlangıç klasörü bulunamadı.');
  return path.win32.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

function otomatikBaslat(komut: string | undefined): void {
  if (process.platform !== 'win32') throw new Error('Otomatik başlatma yalnız Windows içindir.');
  const dosya = path.win32.join(baslangicKlasoru(process.env), BASLANGIC_ADI);
  if (komut === 'kur') {
    writeFileSync(dosya, baslangicBetigi(path.win32.resolve(kok), process.execPath));
    console.log(`Kuruldu: ${dosya}\nOturum açılınca sunucu bekçiyle açılır. Şimdi açmak için: npm.cmd run bekci`);
  } else if (komut === 'kaldir') {
    rmSync(dosya, { force: true });
    console.log(`Kaldırıldı: ${dosya}`);
  } else if (komut === 'durum') {
    console.log(existsSync(dosya) ? `Kurulu: ${dosya}` : 'Kurulu değil.');
  } else {
    throw new Error('Kullanım: npm run otomatik-baslat -- kur | kaldir | durum');
  }
}

function bekciyiCalistir(): void {
  const gunluk = gunlukDosyasi(kok);
  // Kapı .env'dedir; bekçi onu yalnız okur, kendi ortamına yazmaz (alt süreçler .env'i kendileri yükler).
  const env: NodeJS.ProcessEnv = { ...process.env };
  ortamiYukle(kok, env, undefined, GOC_KIMLIGI);
  const port = Number(env['TMIV2_PORT']?.trim() || '4100');
  const guncellemeDizini = env['TMIV2_GUNCELLEME_DIZINI']?.trim() ?? '';
  const yaz = (satir: string): void => {
    const metin = `${new Date().toISOString()} [bekçi] ${satir}\n`;
    process.stdout.write(metin);
    dosyayaYaz(gunluk, metin);
  };
  let suren: ChildProcess | null = null;
  const bekci = new Bekci({
    baslat: () => {
      const surec = spawn(process.execPath, ['araclar/baslat.ts'], {
        cwd: kok, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
      });
      for (const [akis, hedef] of [[surec.stdout, process.stdout], [surec.stderr, process.stderr]] as const) {
        akis.on('data', (parca: Buffer) => {
          hedef.write(parca);
          dosyayaYaz(gunluk, parca.toString('utf8'));
        });
      }
      suren = surec;
      return {
        sonlandir: () => { agaciSonlandir(surec); },
        kapandi: new Promise((coz) => {
          surec.on('error', (hata) => { yaz(`Sunucu başlatılamadı: ${hata.message}`); });
          surec.on('close', (kod, sinyal) => { coz({ kod, sinyal }); });
        }),
      };
    },
    bekle: (ms) => new Promise((coz) => { setTimeout(coz, ms); }),
    simdi: () => Date.now(),
    yaz,
    yokla: () => saglikYokla(port),
    ...(guncellemeDizini === '' ? {} : { guncellemeSuruyor: () => guncellemeSuruyorMu(isaretZamani(path.join(guncellemeDizini, GUNCELLEME_ISARETI)), Date.now()) }),
  });
  // Windows'ta Ctrl+C ve pencereyi kapatma aynı konsoldaki sunucuya da gider; bekçi yalnız yeniden açmayı bırakır. Orada kill() süreci
  // sinyalsiz sonlandırır ve sunucunun alt süreçleri sahipsiz kalır, o yüzden sinyal yalnız öteki sistemlerde iletilir.
  const durdur = (sinyal: NodeJS.Signals): void => {
    bekci.durdur();
    if (process.platform !== 'win32' && suren !== null && suren.exitCode === null) suren.kill(sinyal);
  };
  process.on('SIGINT', () => { durdur('SIGINT'); });
  process.on('SIGTERM', () => { durdur('SIGTERM'); });
  yaz(`Günlük: ${gunluk}`);
  void bekci.calistir();
}

const dogrudanKosuyor = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (dogrudanKosuyor) {
  const [komut, ...kalan] = process.argv.slice(2);
  try {
    if (komut === 'otomatik-baslat') otomatikBaslat(kalan[0]);
    else if (komut === undefined) bekciyiCalistir();
    else throw new Error('Kullanım: npm run bekci | npm run otomatik-baslat -- kur | kaldir | durum');
  } catch (hata) {
    console.error(hata instanceof Error ? hata.message : String(hata));
    process.exitCode = 1;
  }
}
