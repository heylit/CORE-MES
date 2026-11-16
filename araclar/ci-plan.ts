import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KAPALI_MODULLER } from '#paylasilan/kapali-moduller.ts';
import { etkiHesapla, kablolamaOku, kaynaklariOku } from './etki.ts';
import type { Etki } from './etki.ts';
import { SUNUCU_TEST_DESENLERI } from './test-sunucu.ts';

// CI parça planı (3310 a). `kapsam` işi hangi ağır işin koşacağını `ci-kapsam.sh` ile seçer; bu araç o işlerin dosyalarını
// seçer ve parçalara böler. Çekme isteğinde yalnız değişen dosyaların ithal grafiğinde etkilediği testler (araclar/etki.ts) ve
// etkilenen modüllerin ekran testleri koşar; ana dalda ve elle koşuda her dosya koşar. Bölme ölçülmüş süreyle yapılır: süreler
// ana dal koşularından önbelleğe yazılır, ölçüsü olmayan dosya bilinenlerin ortancası sayılır.

export type Is = 'sunucu' | 'istemci' | 'ekran' | 'windows';
export const ISLER: readonly Is[] = ['sunucu', 'istemci', 'ekran', 'windows'];

// Parça sayısı üst sınırdır: seçilen dosya azsa parça sayısı dosya sayısına iner.
export const PARCA: Readonly<Record<Is, number>> = { sunucu: 8, istemci: 3, ekran: 6, windows: 4 };

// Windows'ta koşan sunucu testleri (çekirdek ve en riskli üç modül, 3018 a).
export const WINDOWS_DESENLERI = ['sunucu/cekirdek/**/*.test.ts', 'sunucu/moduller/stok/**/*.test.ts',
  'sunucu/moduller/uretim-emirleri/**/*.test.ts', 'sunucu/moduller/plan/**/*.test.ts'];
const ISTEMCI_DESENLERI = ['istemci/src/**/*.test.ts', 'istemci/src/**/*.test.tsx', 'istemci/derleme-bilgisi.test.ts'];

export type Secim = Record<Is, string[]>;

const sirala = (d: Iterable<string>): string[] => [...new Set(d)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function desenle(kok: string, desenler: readonly string[]): string[] {
  return sirala(desenler.flatMap((d) => globSync(d, { cwd: kok })).map((d) => d.replaceAll('\\', '/')));
}

const EKRAN_TESTI = /^ekran-testleri\/[^/]+\.spec\.ts$/;

const kapaliEkranMi = (dosya: string): boolean =>
  KAPALI_MODULLER.some((ad) => new RegExp(`(^|/)${ad}(-[^/]*)?\\.spec\\.ts$`).test(dosya));

export function tumDosyalar(kok: string): Secim {
  return {
    sunucu: desenle(kok, SUNUCU_TEST_DESENLERI),
    istemci: desenle(kok, ISTEMCI_DESENLERI),
    ekran: desenle(kok, ['ekran-testleri/*.spec.ts']).filter((d) => !kapaliEkranMi(d)),
    windows: desenle(kok, WINDOWS_DESENLERI),
  };
}

// Ekran testinin açtığı sayfaların modülleri: `ac('/plan/kokpit')` ya da `goto('/plan/...')` yolunun ilk parçası. Değişkenle
// açılan sayfa (sayfa listesi) ya da modül klasörü olmayan yol varsa null: test her değişiklikte koşar.
export function ekranModulleri(icerik: string, istemciModulleri: ReadonlySet<string>): string[] | null {
  const acilislar = [...icerik.matchAll(/\b(?:ac|goto|sayfaAc)\(\s*([^)\s][^,)]*)/g)].map((e) => (e[1] ?? '').trim());
  if (acilislar.length === 0) return null;
  const moduller = new Set<string>();
  for (const a of acilislar) {
    const yol = /^['`]\/([a-z0-9-]+)/.exec(a)?.[1];
    if (yol === undefined || !istemciModulleri.has(yol)) return null;
    moduller.add(yol);
  }
  return sirala(moduller);
}

export interface SecimGirdisi {
  degisenler: readonly string[];
  etki: Etki;
  tum: Secim;
  ekranIcerikleri: ReadonlyMap<string, string>;
  istemciModulleri: ReadonlySet<string>;
  // Sunucu test dosyalarının metni: ithal grafiğinde olmayan dosyayı (göç, kural metni) okuyan testi bulmak için.
  sunucuIcerikleri: ReadonlyMap<string, string>;
}

const kodMu = (yol: string): boolean => /\.tsx?$/.test(yol) && ['sunucu/', 'istemci/', 'paylasilan/', 'araclar/', 'arkon/'].some((k) => yol.startsWith(k));

// İthal grafiğinde olmayan değişen dosyayı (göç, kural metni, yapılandırma olmayan veri) adıyla anan sunucu testi. Göç klasörünü
// okuyan testler dosya adını değil klasörü anar: göç değişince klasör adı da aranır.
export function anilanTestler(degisenler: readonly string[], icerikler: ReadonlyMap<string, string>): string[] {
  const izler = new Set<string>();
  for (const d of degisenler) {
    if (kodMu(d) || EKRAN_TESTI.test(d)) continue;
    izler.add(d);
    izler.add(posix.basename(d));
    if (d.startsWith('sunucu/gocler/')) izler.add('gocler');
  }
  if (izler.size === 0) return [];
  return sirala([...icerikler].filter(([, metin]) => [...izler].some((iz) => metin.includes(iz))).map(([d]) => d));
}

// Etki grafiğin bilmediği bir değişiklik bulursa (paket, yapılandırma, arkon) her şey koşar. Ekran: değişen ekran testi,
// etkilenen modülün sayfasını açan test ve modüle bağlanamayan test koşar; istemcide modül dışındaki üretim dosyası
// etkilendiyse (kabuk, giriş) bütün ekran testleri koşar.
export function secimHesapla(g: SecimGirdisi): Secim {
  if (g.etki.bilinmeyenler.length > 0) return g.tum;
  const tumu = new Set(g.tum.sunucu);
  const sunucu = sirala([...g.etki.nodeTestleri, ...anilanTestler(g.degisenler, g.sunucuIcerikleri)].filter((d) => tumu.has(d)));
  const istemciTumu = new Set(g.tum.istemci);
  const istemci = g.etki.vitestTestleri.filter((d) => istemciTumu.has(d));
  const windowsTumu = new Set(g.tum.windows);
  const windows = sunucu.filter((d) => windowsTumu.has(d));

  let ekran: string[];
  const ekranOrtak = g.degisenler.some((d) => d.startsWith('ekran-testleri/') && !d.endsWith('.spec.ts') && !d.startsWith('ekran-testleri/benzetim/'))
    || g.etki.digerDosyalar.some((d) => d.startsWith('istemci/'));
  if (ekranOrtak) {
    ekran = g.tum.ekran;
  } else {
    const moduller = new Set(g.etki.moduller.map((m) => m.ad));
    const degisen = new Set(g.degisenler);
    ekran = g.tum.ekran.filter((d) => {
      if (degisen.has(d)) return true;
      const m = ekranModulleri(g.ekranIcerikleri.get(d) ?? '', g.istemciModulleri);
      return m === null || m.some((ad) => moduller.has(ad));
    });
  }
  return { sunucu, istemci, ekran, windows };
}

// Süreler: dosya -> ms. Ölçüsü olmayan dosya bilinenlerin ortancasıdır; hiç ölçü yoksa her dosya 1 sayılır (sayıyla bölme).
export function bol(dosyalar: readonly string[], parcaSayisi: number, sureler: ReadonlyMap<string, number> = new Map()): string[][] {
  const n = Math.max(1, Math.min(parcaSayisi, dosyalar.length));
  const bilinen = dosyalar.map((d) => sureler.get(d)).filter((s): s is number => s !== undefined).sort((a, b) => a - b);
  const ortanca = bilinen.length === 0 ? 1 : bilinen[Math.floor(bilinen.length / 2)]!;
  const agirlik = (d: string): number => sureler.get(d) ?? ortanca;
  // En uzun iş önce, o an en hafif parçaya (LPT). Eşitlikte ad sırası: her makinede aynı plan çıkar.
  const sirali = [...dosyalar].sort((a, b) => agirlik(b) - agirlik(a) || (a < b ? -1 : a > b ? 1 : 0));
  const parcalar = Array.from({ length: n }, () => ({ toplam: 0, dosyalar: [] as string[] }));
  for (const d of sirali) {
    let hafif = parcalar[0]!;
    for (const p of parcalar) if (p.toplam < hafif.toplam) hafif = p;
    hafif.dosyalar.push(d);
    hafif.toplam += agirlik(d);
  }
  return parcalar.map((p) => sirala(p.dosyalar));
}

// Playwright json raporu: dosya başına bütün genişliklerdeki test sürelerinin toplamı.
interface PwTakim { file?: string; suites?: PwTakim[]; specs?: { file?: string; tests?: { results?: { duration?: number }[] }[] }[] }
export function ekranSureleri(rapor: { suites?: PwTakim[] }): Record<string, number> {
  const sonuc = new Map<string, number>();
  const gez = (t: PwTakim): void => {
    for (const s of t.specs ?? []) {
      const dosya = s.file ?? t.file;
      if (dosya === undefined) continue;
      const yol = posix.join('ekran-testleri', dosya.replaceAll('\\', '/'));
      for (const test of s.tests ?? []) for (const r of test.results ?? []) sonuc.set(yol, (sonuc.get(yol) ?? 0) + (r.duration ?? 0));
    }
    for (const alt of t.suites ?? []) gez(alt);
  };
  for (const t of rapor.suites ?? []) gez(t);
  return Object.fromEntries(sirala(sonuc.keys()).map((d) => [d, Math.round(sonuc.get(d)!)]));
}

export type Sureler = Partial<Record<Is, Record<string, number>>>;

// Eski ölçü yenisiyle ezilir; bu koşuda ölçülmeyen dosyanın eski ölçüsü kalır (çekme isteği yalnız bir kısmını koşar).
export function sureleriBirlestir(eski: Sureler, yeni: Sureler): Sureler {
  const sonuc: Sureler = {};
  for (const is of ISLER) {
    const birlesik = { ...(eski[is] ?? {}), ...(yeni[is] ?? {}) };
    if (Object.keys(birlesik).length > 0) sonuc[is] = birlesik;
  }
  return sonuc;
}

export interface Plan { is: Is; parcalar: string[][] }

export function planKur(secim: Secim, acik: Readonly<Record<Is, boolean>>, sureler: Sureler): Plan[] {
  return ISLER.filter((is) => acik[is] && secim[is].length > 0)
    .map((is) => ({ is, parcalar: bol(secim[is], PARCA[is], new Map(Object.entries(sureler[is] ?? {}))) }));
}

const jsonOku = <T>(yol: string, bos: T): T => (existsSync(yol) ? JSON.parse(readFileSync(yol, 'utf8')) as T : bos);

async function planKomutu(argv: string[], kok: string): Promise<void> {
  const arg = (ad: string): string | undefined => { const i = argv.indexOf(ad); return i < 0 ? undefined : argv[i + 1]; };
  const cikti = arg('--cikti');
  const olay = arg('--olay') ?? '';
  if (cikti === undefined) throw new Error('Kullanım: node araclar/ci-plan.ts plan --olay <olay> --cikti <klasör> [--sureler <json>] < değişenler');
  const acik: Record<Is, boolean> = {
    sunucu: process.env['SUNUCU'] === 'true', istemci: process.env['ISTEMCI'] === 'true',
    ekran: process.env['EKRAN'] === 'true', windows: process.env['SUNUCU'] === 'true',
  };
  const tum = tumDosyalar(kok);
  let secim = tum;
  if (olay === 'pull_request') {
    const degisenler = readFileSync(0, 'utf8').split(/\r?\n/).map((s) => posix.normalize(s.trim())).filter((s) => s !== '' && s !== '.');
    if (degisenler.length > 0) {
      const istemciModulleri = new Set(globSync('istemci/src/moduller/*/', { cwd: kok }).map((d) => posix.basename(d.replaceAll('\\', '/'))));
      secim = secimHesapla({
        degisenler, tum, istemciModulleri,
        // Ekran testi ithal grafiğinde değildir; etkiye verilirse "bilinmeyen" sayılır ve her şeyi koşturur. Seçimi aşağıdadır.
        etki: etkiHesapla(await kaynaklariOku(kok), await kablolamaOku(kok), degisenler.filter((d) => !EKRAN_TESTI.test(d))),
        ekranIcerikleri: new Map(tum.ekran.map((d) => [d, readFileSync(join(kok, d), 'utf8')])),
        sunucuIcerikleri: new Map(tum.sunucu.map((d) => [d, readFileSync(join(kok, d), 'utf8')])),
      });
    }
  }
  const sureler = jsonOku<Sureler>(arg('--sureler') ?? '', {});
  const plan = planKur(secim, acik, sureler);
  mkdirSync(cikti, { recursive: true });
  const satirlar: string[] = [];
  for (const is of ISLER) {
    const p = plan.find((x) => x.is === is);
    p?.parcalar.forEach((dosyalar, i) => writeFileSync(join(cikti, `${is}-${String(i + 1)}.txt`), `${dosyalar.join('\n')}\n`));
    const tamMi = p !== undefined && secim[is].length === tum[is].length;
    console.error(`${is}: ${p === undefined ? 'koşmaz' : `${String(secim[is].length)}/${String(tum[is].length)} dosya, ${String(p.parcalar.length)} parça${tamMi ? '' : ' (daraltıldı)'}`}`);
    satirlar.push(`${is}=${String(p !== undefined)}`, `${is}_matris=${JSON.stringify(p === undefined ? [1] : p.parcalar.map((_, i) => i + 1))}`);
  }
  console.log(satirlar.join('\n'));
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// plan: değişen dosyaları standart girdiden okur, parça listelerini klasöre, iş çıktılarını standart çıktıya yazar.
// ekran-sure <playwright json> <çıktı>: playwright raporunu dosya süresine çevirir.
// birlestir <eski json> <çıktı> <is=ölçü.json>...: süreleri birleştirir.
if (dogrudanKosuyor) {
  const kok = fileURLToPath(new URL('../', import.meta.url));
  const [komut, ...geri] = process.argv.slice(2);
  try {
    if (komut === 'plan') await planKomutu(geri, kok);
    else if (komut === 'ekran-sure' && geri.length === 2) {
      writeFileSync(geri[1]!, `${JSON.stringify(ekranSureleri(jsonOku(geri[0]!, {})))}\n`);
    } else if (komut === 'birlestir' && geri.length >= 2) {
      const yeni: Sureler = {};
      for (const a of geri.slice(2)) {
        const [is, yol] = a.split('=') as [Is, string];
        if (!ISLER.includes(is)) throw new Error(`Bilinmeyen iş: ${is}`);
        yeni[is] = { ...(yeni[is] ?? {}), ...jsonOku<Record<string, number>>(yol, {}) };
      }
      writeFileSync(geri[1]!, `${JSON.stringify(sureleriBirlestir(jsonOku<Sureler>(geri[0]!, {}), yeni))}\n`);
    } else {
      throw new Error('Kullanım: node araclar/ci-plan.ts plan|ekran-sure|birlestir ...');
    }
  } catch (hata) {
    console.error((hata as Error).message);
    process.exit(1);
  }
}
