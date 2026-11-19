import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pakettekiOzet } from '../sunucu/moduller/logo/disari.ts';
import { ayarPlani, geriAl, uygula, type AyarPlani } from './logo-yardimci-ayar.ts';
import { ILK_GECIS_ISARETI } from './logo-yardimci-ilk-gecis-tetik.ts';
import {
  yardimciAdimlari, yardimciKlasorAdi, yardimciyiGuncelle, type YardimciGuncellemeAdimlari, type YardimciGuncellemeAyari,
  type YardimciGuncellemeSonucu,
} from './logo-yardimcisi-guncelle.ts';

// 3432-2: canlıdaki güncelleyici ilk kurulum klasörünün kodudur ve 3314 ayarı (.env'de iki değişken, betikte gösterge) yoksa
// Logo yardımcısını atlar; eski yardımcı da kapatma ucunu bilmez. Bu adım yeni sürüm ilk açıldığında bir kez, arka planda koşar:
// betiği ve çalışan exe'yi bulur, 3432 ayarını yapar, yardımcıyı 3314 sırasıyla yeniler. Eski yardımcı kendi ucundan kapanmazsa
// yalnız 4195'i dinleyen logo-yardimcisi.exe süreci durdurulur. Güvenli değilse hiçbir dosyaya dokunmaz; yenisi doğrulanmazsa
// 3314 eskisine döner, betik ve .env yedekten geri konur. Sonraki paketleri ilk kurulumdaki güncelleyici yeniler.
export const YARDIMCI_EXE = 'logo-yardimcisi.exe';
const GOREV_ADI = 'TMIV2 Bekci';
// Sistem araçları PATH'ten değil Windows klasöründen: ortamdaki PATH'e konmuş aynı adlı dosya çalışmasın.
const SISTEM = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32');
const sistemAraci = (ad: string): string => join(SISTEM, ad);

export interface CalisanYardimci { pid: number; exe: string }

// `netstat -ano -p TCP` çıktısından kapıyı dinleyen sürecin kimliği.
export function kapiSahibi(netstat: string, port: number): number | null {
  for (const satir of netstat.split(/\r?\n/)) {
    const p = satir.trim().split(/\s+/);
    if (p.length < 5 || p[0]?.toUpperCase() !== 'TCP' || p[3]?.toUpperCase() !== 'LISTENING') continue;
    if (p[1] !== `127.0.0.1:${String(port)}`) continue;
    const pid = Number(p[4]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

// Görev Zamanlayıcı XML'inden komutun, bağımsız değişkenlerin ve çalışma klasörünün işaret ettiği klasörler.
export function gorevKlasorleri(xml: string): string[] {
  const klasorler: string[] = [];
  for (const etiket of ['Command', 'Arguments', 'WorkingDirectory']) {
    const icerik = new RegExp(`<${etiket}>([^<]*)</${etiket}>`, 'i').exec(xml)?.[1] ?? '';
    for (const m of icerik.replace(/&quot;/g, '"').matchAll(/[A-Za-z]:\\[^"<>|\r\n]*/g)) {
      const yol = m[0].trim().replace(/\\+$/, '');
      klasorler.push(etiket === 'WorkingDirectory' || !/\.[A-Za-z0-9]{2,4}$/.test(yol) ? yol : win32.dirname(yol));
    }
  }
  return [...new Set(klasorler)];
}

// Betik: aday .cmd/.bat dosyalarından çalışan exe'nin yolunu içeren tek dosya. Birden çoksa hangisinin açtığı bilinemez.
export function betikSec(adaylar: readonly { yol: string; metin: string }[], exe: string): string | { hata: string } {
  const e = exe.toLowerCase();
  const bulunan = [...new Map(adaylar.filter((a) => a.metin.toLowerCase().includes(e)).map((a) => [a.yol.toLowerCase(), a.yol])).values()];
  if (bulunan.length === 1) return bulunan[0] ?? '';
  if (bulunan.length === 0) return { hata: `Çalışan exe'yi (${exe}) açan betik kurulum klasöründe ya da "${GOREV_ADI}" görevinin klasöründe bulunamadı.` };
  return { hata: `Çalışan exe'yi açan ${String(bulunan.length)} betik var (${bulunan.join(', ')}); hangisinin açtığı bilinmiyor.` };
}

// İlk kurulum klasörü: sürüm klasöründeki .env onun kopyasıdır (guncelleyici envKopyala); içerik aynı olan ve baslat.ts taşıyan aday.
export function kokSec(adaylar: readonly string[], surumEnv: string, oku: (yol: string) => string | null, varMi: (yol: string) => boolean): string | null {
  for (const k of new Set(adaylar.filter((a) => a !== ''))) {
    if (k.split(/[\\/]/).includes('surumler')) continue;
    if (!varMi(join(k, 'araclar', 'baslat.ts'))) continue;
    if (oku(join(k, '.env')) === surumEnv) return k;
  }
  return null;
}

export interface IlkGecisDisi {
  env: Readonly<Record<string, string | undefined>>;
  surumKlasoru: string;
  calisanYardimci(port: number): Promise<CalisanYardimci | null>;
  gorevXml(): Promise<string | null>;
  betikler(klasor: string): string[];
  oku(yol: string): string | null;
  varMi(yol: string): boolean;
  klasorMu(yol: string): boolean;
  ozet(kaynak: string): Promise<string | null>;
  adimlar(ayar: YardimciGuncellemeAyari, kaynak: string, klasorAdi: string): YardimciGuncellemeAdimlari;
  durdur(pid: number): Promise<boolean>;
  bekle(ms: number): Promise<void>;
  simdi(): Date;
}

export type IlkGecisSonucu = { sonuc: 'atlandi' | 'guncel' | 'guncellendi' | 'hata' | 'geri-alindi'; satirlar: string[] };

const KENDI_KAPANMA_MS = 10_000;

export async function ilkGecis(d: IlkGecisDisi, surum: string): Promise<IlkGecisSonucu> {
  const satirlar: string[] = [];
  const atla = (neden: string): IlkGecisSonucu => ({ sonuc: 'atlandi', satirlar: [...satirlar, `Atlandı, hiçbir dosya değişmedi: ${neden}`] });
  const adres = d.env['TMIV2_LOGO_KOPRU_ADRESI']?.trim().replace(/\/+$/, '') ?? '';
  const anahtar = d.env['TMIV2_LOGO_KOPRU_ANAHTARI']?.trim() ?? '';
  const port = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(adres)?.[1];
  if (port === undefined || anahtar === '') return atla('TMIV2_LOGO_KOPRU_ADRESI (http://127.0.0.1:<port>) ya da TMIV2_LOGO_KOPRU_ANAHTARI yok.');
  if ((d.env['TMIV2_LOGO_YARDIMCI_KURULUM']?.trim() ?? '') !== '') return atla('3314 ayarı zaten var; yardımcıyı ilk kurulumdaki güncelleyici yeniler.');

  const kaynak = join(d.surumKlasoru, 'araclar', 'logo-yardimcisi');
  const ozet = await d.ozet(kaynak);
  if (ozet === null) return atla('Paket Logo yardımcısının kaynağını taşımıyor.');
  const calisan = await d.calisanYardimci(Number(port));
  if (calisan === null) return atla(`127.0.0.1:${port} kapısını dinleyen ${YARDIMCI_EXE} yok (yardımcı çalışmıyor ya da süreç yolu okunamadı).`);
  satirlar.push(`Çalışan yardımcı: ${calisan.exe} (süreç ${String(calisan.pid)}).`);

  const kurulum = dirname(dirname(dirname(calisan.exe)));
  const xml = await d.gorevXml();
  const gorev = xml === null ? [] : gorevKlasorleri(xml);
  const adaylar = [kurulum, ...gorev].filter((k) => d.klasorMu(k)).flatMap((k) => d.betikler(k))
    .flatMap((yol) => { const metin = d.oku(yol); return metin === null ? [] : [{ yol, metin }]; });
  const betikYolu = betikSec(adaylar, calisan.exe);
  if (typeof betikYolu !== 'string') return atla(betikYolu.hata);
  const betik = d.oku(betikYolu) ?? '';

  const surumEnv = d.oku(join(d.surumKlasoru, '.env'));
  const npmPaketi = d.env['npm_package_json'];
  const kok = surumEnv === null ? null
    : kokSec([npmPaketi === undefined ? '' : dirname(npmPaketi), d.env['INIT_CWD'] ?? '', ...gorev], surumEnv, d.oku, d.varMi);
  const envYolu = kok === null ? null : join(kok, '.env');

  const plan: AyarPlani = ayarPlani({
    betikYolu, betik, envYolu, env: envYolu === null ? '' : (d.oku(envYolu) ?? ''), kurulum,
    gostergeOku: (k) => { const t = d.oku(join(k, 'logo-yardimcisi-guncel.txt'))?.split(/\r?\n/)[0]?.trim() ?? ''; return t === '' ? null : t; },
    dosyaVarMi: d.varMi, klasorVarMi: d.klasorMu,
  });
  if (plan.tur === 'red') return atla(plan.ileti);
  satirlar.push(...plan.uyarilar.map((u) => `Uyarı: ${u}`));
  let ayarYapildi = false;
  if (plan.tur === 'yaz') {
    const durum = await uygula(plan, betikYolu, envYolu, d.simdi());
    ayarYapildi = true;
    satirlar.push('Ayar yapıldı:', ...plan.ozet, ...[durum.betik, durum.env].flatMap((k) => (k === null ? [] : [`Yedek: ${k.yedek}`])));
  }

  const temel = d.adimlar({ kurulum, baslat: betikYolu, adres, anahtar }, kaynak, yardimciKlasorAdi(surum, ozet));
  // Eski yardımcı /api/kapat bilmez: kendi kapanmazsa yalnız kapıyı dinleyen logo-yardimcisi.exe süreci durdurulur.
  const a: YardimciGuncellemeAdimlari = {
    ...temel,
    kapat: async () => {
      await temel.kapat().catch(() => undefined);
      for (let gecen = 0; gecen < KENDI_KAPANMA_MS; gecen += 1000) {
        if (await temel.kapiBosMu()) return;
        await d.bekle(1000);
      }
      const simdiki = await d.calisanYardimci(Number(port));
      if (simdiki === null || basename(simdiki.exe).toLowerCase() !== YARDIMCI_EXE) return;
      const durdu = await d.durdur(simdiki.pid);
      satirlar.push(durdu ? `Yardımcı süreci ${String(simdiki.pid)} durduruldu.` : `Yardımcı süreci ${String(simdiki.pid)} durdurulamadı (yetki).`);
    },
  };
  const s: YardimciGuncellemeSonucu = await yardimciyiGuncelle(ozet, a);
  satirlar.push(`Logo yardımcısı: ${s.sonuc}. ${s.ileti}`);
  if (s.sonuc === 'guncellendi' || s.sonuc === 'guncel') return { sonuc: s.sonuc, satirlar };
  if (!ayarYapildi) return { sonuc: 'hata', satirlar };
  // Yenisi olmadı: betik ve .env yedekten döner; betik yine eski sabit exe'yi açar. Kapı boşsa eski yardımcı bir kez açılır.
  satirlar.push(...(await geriAl(kurulum, d.simdi()).catch((hata: unknown) => [`Geri alma bozuldu: ${hata instanceof Error ? hata.message : String(hata)}`])));
  if (await temel.kapiBosMu()) {
    temel.baslat();
    satirlar.push('Kapı boştu; eski betik bir kez çalıştırıldı.');
  }
  return { sonuc: 'geri-alindi', satirlar };
}

function komut(dosya: string, argumanlar: readonly string[]): Promise<string | null> {
  return new Promise((coz) => {
    execFile(dosya, argumanlar, { windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (hata, cikti) => { coz(hata === null ? cikti : null); });
  });
}

function gercekDis(surumKlasoru: string): IlkGecisDisi {
  const oku = (yol: string): string | null => { try { return readFileSync(yol, 'utf8'); } catch { return null; } };
  return {
    env: process.env,
    surumKlasoru,
    calisanYardimci: async (port) => {
      const pid = kapiSahibi((await komut(sistemAraci('NETSTAT.EXE'), ['-ano', '-p', 'TCP'])) ?? '', port);
      if (pid === null) return null;
      const exe = ((await komut(sistemAraci(join('WindowsPowerShell', 'v1.0', 'powershell.exe')), ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-CimInstance Win32_Process -Filter 'ProcessId=${String(pid)}').ExecutablePath`])) ?? '').trim();
      return exe === '' || basename(exe).toLowerCase() !== YARDIMCI_EXE ? null : { pid, exe };
    },
    gorevXml: () => komut(sistemAraci('schtasks.exe'), ['/Query', '/TN', GOREV_ADI, '/XML']),
    betikler: (k) => {
      try {
        return readdirSync(k).filter((a) => /\.(cmd|bat)$/i.test(a)).map((a) => join(k, a));
      } catch { return []; }
    },
    oku,
    varMi: (y) => existsSync(y) && statSync(y).isFile(),
    klasorMu: (y) => existsSync(y) && statSync(y).isDirectory(),
    ozet: (k) => pakettekiOzet(`${k}${sep}`),
    adimlar: yardimciAdimlari,
    durdur: async (pid) => (await komut(sistemAraci('taskkill.exe'), ['/PID', String(pid), '/F'])) !== null,
    bekle: (ms) => new Promise((coz) => setTimeout(coz, ms)),
    simdi: () => new Date(),
  };
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (dogrudanKosuyor) {
  const surumKlasoru = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]+$/, '');
  const dizin = dirname(dirname(surumKlasoru));
  const surum = basename(surumKlasoru).slice(0, 7);
  console.log(`${new Date().toISOString()} Logo yardımcısı ilk geçiş başladı (${surum}).`);
  const s = await ilkGecis(gercekDis(surumKlasoru), surum)
    .catch((hata: unknown) => ({ sonuc: 'hata' as const, satirlar: [`Beklenmeyen hata: ${hata instanceof Error ? hata.message : String(hata)}`] }));
  for (const satir of s.satirlar) console.log(satir);
  console.log(`${new Date().toISOString()} Logo yardımcısı ilk geçiş: ${s.sonuc}.`);
  await writeFile(join(dizin, ILK_GECIS_ISARETI), `${JSON.stringify({ tarih: new Date().toISOString(), surum, ...s }, null, 2)}\n`).catch(() => undefined);
}
