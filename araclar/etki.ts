import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { dosyalariTopla, modulYeri, testDosyasiMi } from './sinir-denetimi.ts';
import type { KaynakDosya } from './sinir-denetimi.ts';

// Kablolamadaki bir bağ: `kanca` olayı ya da çözücüyü tutan modül, `karsilik` ona işlevini veren modül. İkisi de birbirini
// ithal etmez (ADR 0006); bağ yalnız sunucu/kablolama.ts'te görünür, o yüzden ithal grafiğine ayrıca eklenir.
export interface KablolamaBagi {
  ad: string;
  kanca: { modul: string; ad: string };
  karsilik: { modul: string; ad: string };
  satir: number;
}

export const KABLOLAMA = 'sunucu/kablolama.ts';

const MODUL_DISARISI = /\.\/moduller\/([a-z][a-z0-9-]*)\/disari\.ts$/;

// Yalnız `bag('<ad>', <ad veya ns.ad>, <ad veya ns.ad> ...)` biçimi okunur. Karşılık bir ifadeyle başlıyorsa
// (`siparisAyrintisi && (async ...)`) ilk ad alınır; o ifadeyi kuran işlev de o modülündür.
export function kablolamaBaglari(icerik: string): KablolamaBagi[] {
  const adModulu = new Map<string, string>();
  for (const e of icerik.matchAll(/\bimport\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)'/g)) {
    const modul = MODUL_DISARISI.exec(e[2] ?? '')?.[1];
    if (modul !== undefined && e[1] !== undefined) adModulu.set(e[1], modul);
  }
  for (const e of icerik.matchAll(/\bimport\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
    const modul = MODUL_DISARISI.exec(e[2] ?? '')?.[1];
    if (modul === undefined) continue;
    for (const parca of (e[1] ?? '').split(',')) {
      const ad = parca.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (ad) adModulu.set(ad, modul);
    }
  }
  const coz = (bas: string | undefined, son: string | undefined): { modul: string; ad: string } | null => {
    if (bas === undefined) return null;
    const modul = adModulu.get(bas);
    if (modul === undefined) return null;
    return { modul, ad: son ?? bas };
  };
  const baglar: KablolamaBagi[] = [];
  for (const e of icerik.matchAll(/\bbag\(\s*'([^']+)'\s*,\s*(\w+)(?:\.(\w+))?\s*,\s*(\w+)(?:\.(\w+))?/g)) {
    const kanca = coz(e[2], e[3]);
    const karsilik = coz(e[4], e[5]);
    if (kanca === null || karsilik === null || e[1] === undefined) continue;
    baglar.push({ ad: e[1], kanca, karsilik, satir: icerik.slice(0, e.index).split('\n').length });
  }
  return baglar;
}

export async function kablolamaOku(kok: string): Promise<KablolamaBagi[]> {
  const dosya = join(kok, KABLOLAMA);
  return existsSync(dosya) ? kablolamaBaglari(await readFile(dosya, 'utf8')) : [];
}

// Sınır aracıyla aynı ithal biçimleri ve takma adlar; burada her ithal (modül içi dahil) gerekir.
const ITHAL_DESENLERI = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
];
const TAKMA_ADLAR: ReadonlyArray<readonly [string, string]> = [
  ['#paylasilan/', 'paylasilan/'],
  ['#cekirdek/', 'sunucu/cekirdek/'],
];
const yorumSatiriMi = (satir: string): boolean => /^\s*(?:\/\/|\*|\/\*)/.test(satir);

function hedefYolu(dosya: string, belirtec: string): string | null {
  if (belirtec.startsWith('.')) return posix.normalize(posix.join(posix.dirname(dosya), belirtec));
  for (const [onek, klasor] of TAKMA_ADLAR) {
    if (belirtec.startsWith(onek)) return posix.normalize(klasor + belirtec.slice(onek.length));
  }
  return null;
}

// Uzantısız ithal ve klasör ithali çözücünün yaptığı gibi tamamlanır. Bulunamayan hedef (silinmiş dosya) olduğu gibi kalır:
// silinen dosyayı ithal edenler de etkilenir.
function hedefDosyasi(yol: string, var_: ReadonlySet<string>): string {
  for (const aday of [yol, `${yol}.ts`, `${yol}.tsx`, `${yol}/index.ts`, `${yol}/index.tsx`]) if (var_.has(aday)) return aday;
  return yol;
}

// Her dosya için onu ithal eden dosyalar.
export function tersIthaller(dosyalar: readonly KaynakDosya[]): Map<string, Set<string>> {
  const var_ = new Set(dosyalar.map((d) => d.dosya));
  const ters = new Map<string, Set<string>>();
  for (const { dosya, icerik } of dosyalar) {
    for (const satir of icerik.split(/\r?\n/)) {
      if (yorumSatiriMi(satir)) continue;
      for (const desen of ITHAL_DESENLERI) {
        for (const e of satir.matchAll(desen)) {
          const yol = e[1] === undefined ? null : hedefYolu(dosya, e[1]);
          if (yol === null) continue;
          const hedef = hedefDosyasi(yol, var_);
          if (hedef === dosya) continue;
          const kume = ters.get(hedef) ?? new Set<string>();
          kume.add(dosya);
          ters.set(hedef, kume);
        }
      }
    }
  }
  return ters;
}

export const TARANAN = ['sunucu', 'istemci', 'paylasilan', 'araclar', 'arkon'];

export interface EtkilenenModul {
  taraf: 'sunucu' | 'istemci';
  ad: string;
  // İlki ithal, göç ya da değişiklik nedenidir; bağ nedenleri arkasından gelir.
  nedenler: string[];
}

export interface Etki {
  degisenler: string[];
  moduller: EtkilenenModul[];
  // Test kenarı olmayan ve modüle ait olmayan etkilenen dosyalar (çekirdek, giriş noktası, araç).
  digerDosyalar: string[];
  nodeTestleri: string[];
  vitestTestleri: string[];
  // Grafiğin bilmediği değişiklik (paket, yapılandırma, ekran testi): tam test gerekir.
  bilinmeyenler: string[];
}

// Testin ortak kurulumu ve örnek veri de test kenarıdır (sınır aracıyla aynı): onlardan geçen bağ üretimdeki akış değildir.
const testKenariMi = (dosya: string): boolean =>
  testDosyasiMi(dosya) || /(?:^|\/)test-ortak\.tsx?$/.test(dosya) || /^sunucu\/moduller\/[^/]+\/ornek-veri\.ts$/.test(dosya);

const etkisizMi = (yol: string): boolean => yol.endsWith('.md') || /^(?:belgeler|kurulum)\//.test(yol);
const kodMu = (yol: string): boolean => /\.tsx?$/.test(yol);

function gocModulu(yol: string, sunucuModulleri: readonly string[]): string | null {
  const ad = /^sunucu\/gocler\/\d+_(\w+)\.sql$/.exec(yol)?.[1];
  if (ad === undefined) return null;
  // En uzun ad önce: `stok` ile `stok_sayim` gibi önek çakışmasında doğru modül seçilsin.
  const adaylar = [...sunucuModulleri].sort((a, b) => b.length - a.length);
  return adaylar.find((m) => ad === m.replaceAll('-', '_') || ad.startsWith(`${m.replaceAll('-', '_')}_`)) ?? null;
}

const modulAnahtari = (taraf: string, ad: string): string => `${taraf} ${ad}`;

// Değişen dosyadan geriye ithal grafiğinde yürür (geçişli), sonra kablolama bağlarıyla bir adım karşı modüle geçer.
// Bağ adımı geçişli değildir: karşı modülün kodu değişmedi, yalnız o bağın iki ucu birlikte koşar.
export function etkiHesapla(
  dosyalar: readonly KaynakDosya[],
  baglar: readonly KablolamaBagi[],
  degisenler: readonly string[],
): Etki {
  const ters = tersIthaller(dosyalar);
  const varOlanlar = new Set(dosyalar.map((d) => d.dosya));
  const sunucuModulleri = [...new Set(dosyalar.map((d) => modulYeri(d.dosya)).filter((y) => y?.taraf === 'sunucu').map((y) => y!.ad))];

  const moduller = new Map<string, EtkilenenModul>();
  const modulEkle = (taraf: 'sunucu' | 'istemci', ad: string, neden: string, ek = false): void => {
    const var_ = moduller.get(modulAnahtari(taraf, ad));
    if (var_ === undefined) moduller.set(modulAnahtari(taraf, ad), { taraf, ad, nedenler: [neden] });
    else if (ek) var_.nedenler.push(neden);
  };
  const degisenModuller = new Set<string>();
  const bilinmeyenler: string[] = [];
  const geldigi = new Map<string, string | null>();
  const kuyruk: string[] = [];
  const tumModulTestleri = new Set<string>();

  for (const yol of [...new Set(degisenler)].sort()) {
    if (etkisizMi(yol)) continue;
    const yer = modulYeri(yol);
    if (kodMu(yol) && TARANAN.some((k) => yol.startsWith(`${k}/`))) {
      if (yer?.taraf === 'sunucu') degisenModuller.add(yer.ad);
      geldigi.set(yol, null);
      kuyruk.push(yol);
      continue;
    }
    const gocun = gocModulu(yol, sunucuModulleri);
    if (gocun !== null) {
      degisenModuller.add(gocun);
      modulEkle('sunucu', gocun, `göç: ${yol}`);
      tumModulTestleri.add(modulAnahtari('sunucu', gocun));
    } else if (yer !== null) {
      if (yer.taraf === 'sunucu') degisenModuller.add(yer.ad);
      modulEkle(yer.taraf, yer.ad, `modül dosyası: ${yol}`);
      tumModulTestleri.add(modulAnahtari(yer.taraf, yer.ad));
    } else {
      bilinmeyenler.push(yol);
    }
  }

  while (kuyruk.length > 0) {
    const dosya = kuyruk.shift()!;
    for (const ithalEden of [...(ters.get(dosya) ?? [])].sort()) {
      if (geldigi.has(ithalEden)) continue;
      geldigi.set(ithalEden, dosya);
      kuyruk.push(ithalEden);
    }
  }

  // Neden, modüle giren ilk kenardır: modül içindeki zincir (disari.ts -> servis.ts) atlanır. Değişen dosya önce, sonra
  // üretim dosyası gelir; modüle yalnız test dosyası üzerinden ulaşıldıysa bu ayrıca söylenir.
  const ayniModul = (a: string, b: string): boolean => {
    const x = modulYeri(a);
    const y = modulYeri(b);
    return x !== null && y !== null && x.taraf === y.taraf && x.ad === y.ad;
  };
  const sira = (d: string): number => (geldigi.get(d) === null ? 0 : testKenariMi(d) ? 2 : 1);
  for (const dosya of [...geldigi.keys()].sort((a, b) => sira(a) - sira(b) || a.localeCompare(b))) {
    const yer = modulYeri(dosya);
    if (yer === null) continue;
    let giris = dosya;
    let onceki = geldigi.get(giris) ?? null;
    while (onceki !== null && ayniModul(onceki, giris)) {
      giris = onceki;
      onceki = geldigi.get(giris) ?? null;
    }
    const testte = testKenariMi(dosya);
    modulEkle(yer.taraf, yer.ad, onceki === null ? `değişti: ${giris}` : `${testte ? 'yalnız testte ithal' : 'ithal'}: ${giris} -> ${onceki}`);
  }

  // Bağ adımı yalnız kodu ya da göçü değişen modülden açılır ve geçişli değildir. Çözücüde etki işlevi verenden kullanana
  // gider; olayda (`...Dinle`) iki yöne: veren yükü değiştirir, dinleyen komutla aynı işlemde koşar.
  for (const b of baglar) {
    const yonler = b.kanca.ad.endsWith('Dinle') ? [[b.kanca, b.karsilik], [b.karsilik, b.kanca]] as const : [[b.karsilik, b.kanca]] as const;
    for (const [bu, karsi] of yonler) {
      if (!degisenModuller.has(bu.modul) || bu.modul === karsi.modul) continue;
      modulEkle('sunucu', karsi.modul, `bağ '${b.ad}' (${KABLOLAMA}:${String(b.satir)}): ${b.kanca.modul}.${b.kanca.ad} <- ${b.karsilik.modul}.${b.karsilik.ad}`, true);
      tumModulTestleri.add(modulAnahtari('sunucu', karsi.modul));
    }
  }

  const testler = new Set([...geldigi.keys()].filter((d) => testDosyasiMi(d) && varOlanlar.has(d)));
  for (const d of varOlanlar) {
    const yer = modulYeri(d);
    if (yer !== null && testDosyasiMi(d) && tumModulTestleri.has(modulAnahtari(yer.taraf, yer.ad))) testler.add(d);
  }
  const sirali = [...testler].sort();
  return {
    degisenler: [...new Set(degisenler)].sort(),
    moduller: [...moduller.values()].sort((a, b) => a.taraf.localeCompare(b.taraf) || a.ad.localeCompare(b.ad)),
    digerDosyalar: [...geldigi.keys()].filter((d) => modulYeri(d) === null && !testKenariMi(d)).sort(),
    nodeTestleri: sirali.filter((d) => !d.startsWith('istemci/') && !d.startsWith('arkon/')),
    vitestTestleri: sirali.filter((d) => d.startsWith('istemci/')),
    bilinmeyenler: [...bilinmeyenler, ...sirali.filter((d) => d.startsWith('arkon/'))],
  };
}

export async function kaynaklariOku(kok: string): Promise<KaynakDosya[]> {
  const dosyalar: KaynakDosya[] = [];
  for (const klasor of TARANAN) {
    if (!existsSync(join(kok, klasor))) continue;
    for (const dosya of await dosyalariTopla(kok, klasor)) dosyalar.push({ dosya, icerik: await readFile(join(kok, dosya), 'utf8') });
  }
  return dosyalar;
}

// Dosya verilmezse dalın değişikliği alınır: origin/main ile ortak atadan bu yana commit'li, commit'siz ve izlenmeyen dosyalar.
export function dalinDegisenleri(kok: string, taban = 'origin/main'): string[] {
  const git = (...argumanlar: string[]): string[] =>
    execFileSync('git', argumanlar, { cwd: kok, encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);
  const ata = git('merge-base', taban, 'HEAD')[0] ?? taban;
  return [...new Set([...git('diff', '--name-only', ata), ...git('ls-files', '--others', '--exclude-standard')])];
}

const ON_YUKLEME = '--import ./araclar/ortam-yukle-goc.ts --import ./araclar/kablolama-yukle.ts';

export function etkiMetni(etki: Etki): string {
  const satirlar = [`Değişenler (${etki.degisenler.length})`, ...etki.degisenler.map((d) => `  ${d}`)];
  const genislik = Math.max(0, ...etki.moduller.map((m) => `${m.taraf} ${m.ad}`.length));
  satirlar.push(
    `Etkilenen modüller (${etki.moduller.length})`,
    ...(etki.moduller.length > 0
      ? etki.moduller.flatMap((m) => m.nedenler.map((n, i) => `  ${(i === 0 ? `${m.taraf} ${m.ad}` : '').padEnd(genislik)}  ${n}`))
      : ['  yok']),
    `Modül dışı etkilenen dosyalar (${etki.digerDosyalar.length})${etki.digerDosyalar.length > 0 ? `: ${etki.digerDosyalar.join(', ')}` : ''}`,
    `Testler: node ${etki.nodeTestleri.length}, vitest ${etki.vitestTestleri.length}`,
  );
  if (etki.nodeTestleri.length > 0) satirlar.push(`  node ${ON_YUKLEME} --test ${etki.nodeTestleri.join(' ')}`);
  if (etki.vitestTestleri.length > 0) {
    satirlar.push(`  npx vitest run --config istemci/vite.config.ts ${etki.vitestTestleri.map((d) => d.slice('istemci/'.length)).join(' ')}`);
  }
  if (etki.bilinmeyenler.length > 0) {
    satirlar.push(`Grafiğin bilmediği değişiklik (${etki.bilinmeyenler.length}): ${etki.bilinmeyenler.join(', ')}; tam test gerekir: npm run test`);
  }
  satirlar.push('Görünmeyen bağlar: dizgeyle kurulan dinamik ithal, uç üzerinden HTTP çağrısı, SQL ile başka tabloya bakış; tam test CI\'dadır.');
  return satirlar.join('\n');
}

export async function etkiKos(dosyalar: readonly string[], kok: string): Promise<string> {
  const degisenler = (dosyalar.length > 0 ? [...dosyalar] : dalinDegisenleri(kok)).map((d) => posix.normalize(d.replaceAll('\\', '/')));
  return etkiMetni(etkiHesapla(await kaynaklariOku(kok), await kablolamaOku(kok), degisenler));
}
