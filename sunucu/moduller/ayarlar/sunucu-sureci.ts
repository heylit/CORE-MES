import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { cakisma, gecersiz } from '#cekirdek/hata.ts';
import { kapanisIste, kapanisKurulu } from '#cekirdek/surec.ts';
import type { BekciDurumu, SunucuSureciCevabi, YenidenBaslatCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { guncellemeSuruyor, type GuncellemeOrtami } from './guncelleme.ts';
import { bekciDurumu, type SurecHalkasi } from './kurallar.ts';

// Ekrandan yeniden başlatma: sunucu kendini temiz kapatır, bekçi yeniden açar; yeni süreç .env'i yeniden okur (güncelleyici
// açılışta .env'i sürüm klasörüne yeniden kopyalar). Bekçinin kendi okuduğu ayarlar (kapı, güncelleme klasörü) yalnız bekçi
// yeniden açılınca değişir. Bekçisiz açılmış sunucu kapanınca açılmaz: istek ancak üst süreçlerde bekçi görülünce kabul edilir.

const execFileP = promisify(execFile);
const ZINCIR_DERINLIGI = 6;
const SORGU_SURESI_MS = 10_000;
// Cevap ve denetim kaydı yazılsın diye kapanış biraz sonra başlar.
const KAPANIS_GECIKMESI_MS = 1500;
const BEKCI_ONBELLEK_MS = 60_000;

export type ZincirOkuyucu = (pid: number) => Promise<SurecHalkasi[] | null>;

// Program PATH'ten değil Windows klasöründen alınır, kabuk açılmaz; betiğe giren tek değer tam sayı süreç numarasıdır.
async function windowsZinciri(pid: number, ortam: NodeJS.ProcessEnv = process.env): Promise<SurecHalkasi[] | null> {
  const windows = ortam['SystemRoot']?.trim() || ortam['windir']?.trim() || '';
  if (windows === '' || !Number.isSafeInteger(pid)) return null;
  const betik = [
    `$p=${String(pid)};$z=@()`,
    `for($i=0;$i -lt ${String(ZINCIR_DERINLIGI)} -and $p -gt 0;$i++){`,
    `$x=Get-CimInstance Win32_Process -Filter "ProcessId=$p";if(-not $x){break}`,
    '$z+=[pscustomobject]@{pid=[int]$x.ProcessId;ppid=[int]$x.ParentProcessId;komut=$x.CommandLine;baslangic=([DateTimeOffset]$x.CreationDate).ToUnixTimeMilliseconds()}',
    '$p=$x.ParentProcessId}',
    'ConvertTo-Json -Compress -InputObject @($z)',
  ].join(';');
  try {
    const { stdout } = await execFileP(path.win32.join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', betik], { timeout: SORGU_SURESI_MS, windowsHide: true, maxBuffer: 1024 * 1024 });
    const veri: unknown = JSON.parse(stdout.trim() || '[]');
    return Array.isArray(veri) ? veri.map(halka) : null;
  } catch {
    return null;
  }
}

function halka(v: unknown): SurecHalkasi {
  const o = (v ?? {}) as Record<string, unknown>;
  const sayi = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return { pid: sayi(o['pid']) ?? -1, ppid: sayi(o['ppid']) ?? -1, komut: typeof o['komut'] === 'string' ? o['komut'] : null, baslangic: sayi(o['baslangic']) };
}

// /proc/<pid>/stat: komut adı parantez içindedir ve boşluk taşıyabilir; alanlar son parantezden sonra sayılır.
export function procStatCoz(stat: string): { ppid: number; baslangic: number } | null {
  const alanlar = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const ppid = Number(alanlar[1]);
  const baslangic = Number(alanlar[19]);
  return Number.isFinite(ppid) && Number.isFinite(baslangic) ? { ppid, baslangic } : null;
}

async function linuxZinciri(pid: number): Promise<SurecHalkasi[] | null> {
  const zincir: SurecHalkasi[] = [];
  let p = pid;
  for (let i = 0; i < ZINCIR_DERINLIGI && p > 0; i++) {
    const stat = await readFile(`/proc/${String(p)}/stat`, 'utf8').catch(() => null);
    const cozulen = stat === null ? null : procStatCoz(stat);
    if (cozulen === null) break;
    const komut = await readFile(`/proc/${String(p)}/cmdline`, 'utf8').then((m) => m.split('\0').join(' ').trim()).catch(() => null);
    zincir.push({ pid: p, ppid: cozulen.ppid, komut, baslangic: cozulen.baslangic });
    p = cozulen.ppid;
  }
  return zincir.length === 0 ? null : zincir;
}

export const zincirOku: ZincirOkuyucu = (pid) => {
  if (process.platform === 'win32') return windowsZinciri(pid);
  if (process.platform === 'linux') return linuxZinciri(pid);
  return Promise.resolve(null);
};

export const BEKCI_ILETISI: Readonly<Record<Exclude<BekciDurumu, 'var'>, string>> = {
  yok: 'Sunucu bekçiyle açılmadı; kapanırsa kendiliğinden açılmaz. Yeniden başlatma sunucu bilgisayarından yapılır.',
  bilinmiyor: 'Sunucunun bekçiyle açıldığı doğrulanamadı; kapanırsa açılmayabilir. Yeniden başlatma sunucu bilgisayarından yapılır.',
};

export interface SurecBagimliliklari {
  zincirOku: ZincirOkuyucu;
  kapanisIste: (neden: string) => boolean;
  kapanisKurulu: () => boolean;
  acilis: Date;
  gecikmeMs: number;
}

const varsayilan: SurecBagimliliklari = {
  zincirOku, kapanisIste, kapanisKurulu, acilis: new Date(performance.timeOrigin), gecikmeMs: KAPANIS_GECIKMESI_MS,
};

let onbellek: { zaman: number; durum: Promise<BekciDurumu> } | null = null;
let istenme: string | null = null;

// Testler süreç durumunu sıfırlar.
export function sunucuSureciSifirla(): void {
  onbellek = null;
  istenme = null;
}

async function bekciOku(b: SurecBagimliliklari, taze: boolean): Promise<BekciDurumu> {
  if (!b.kapanisKurulu()) return 'bilinmiyor';
  const an = Date.now();
  if (taze || onbellek === null || an - onbellek.zaman >= BEKCI_ONBELLEK_MS) {
    onbellek = { zaman: an, durum: b.zincirOku(process.pid).catch(() => null).then(bekciDurumu) };
  }
  return onbellek.durum;
}

export async function sunucuSureciOku(o: GuncellemeOrtami, b: SurecBagimliliklari = varsayilan): Promise<SunucuSureciCevabi> {
  return { bekci: await bekciOku(b, false), guncellemeSuruyor: await guncellemeSuruyor(o), acilis: b.acilis.toISOString() };
}

export async function yenidenBaslatIste(
  o: GuncellemeOrtami, kisiId: number, simdi: Date, b: SurecBagimliliklari = varsayilan,
): Promise<YenidenBaslatCevabi> {
  if (istenme !== null) throw cakisma('Yeniden başlatma zaten istendi; sunucu kapanıyor.');
  if (await guncellemeSuruyor(o)) throw cakisma('Güncelleme istendi ya da kuruluyor; bitmeden sunucu yeniden başlatılamaz.');
  // Bekçi o an yaşıyor mu diye önbelleğe bakılmaz: pencere kapatılmış olabilir.
  const bekci = await bekciOku(b, true);
  if (bekci !== 'var') throw gecersiz(BEKCI_ILETISI[bekci]);
  istenme = simdi.toISOString();
  setTimeout(() => {
    if (!b.kapanisIste(`Yeniden başlatma (kişi ${String(kisiId)})`)) istenme = null;
  }, b.gecikmeMs);
  return { istenme, acilis: b.acilis.toISOString() };
}
