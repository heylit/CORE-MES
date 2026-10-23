import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

// Tek eslint süreci tip bilgili kurallar için bütün tsconfig programlarını aynı bellekte kurar ve 4 GB yığını aşar (kart #143).
// Dosyalar parçalara bölünür, her parça kendi sürecinde koşar: CI'da paralel işler, yerelde sırayla.

export const PARCA_SAYISI = 4;
const YIGIN_MB = 4096;

// Dosyanın tip programı: eslint.config.js'deki parserOptions.project sırasıyla, ilk kapsayan tsconfig. paylasilan iki
// programda da vardır, ilk sıradaki sunucu onu alır. Program kurmak parçanın sabit maliyetidir; parça tek programda kalır.
export type Program = 'sunucu' | 'istemci' | 'ekran';

export function programi(dosya: string): Program {
  if (dosya.startsWith('istemci/') || dosya.startsWith('arkon/')) return 'istemci';
  if (dosya.startsWith('ekran-testleri/')) return 'ekran';
  return 'sunucu';
}

// Modül klasörü bölünmez; modül dışındaki dosyalar programın ortak grubudur.
export function grubu(dosya: string): string {
  const modul = /^(sunucu\/moduller|istemci\/src\/moduller)\/[^/]+\//.exec(dosya);
  return modul ? modul[0] : `${programi(dosya)}:ortak`;
}

interface Parca {
  dosyalar: string[];
}

// Programlara parça sayısı dosya payıyla verilir. Payı yarım parçadan küçük program kendi parçasını almaz, en hafif
// parçaya eklenir: iki program kurar ama küçük programın maliyeti düşüktür. Grup, programının en hafif parçasına girer.
export function parcala(dosyalar: readonly string[], n: number): string[][] {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Parça sayısı geçersiz: ${String(n)}`);
  const gruplar = new Map<string, string[]>();
  for (const dosya of [...dosyalar].sort()) {
    const ad = grubu(dosya);
    gruplar.set(ad, [...(gruplar.get(ad) ?? []), dosya]);
  }
  const programlar = new Map<Program, string[][]>();
  for (const [ad, liste] of [...gruplar].sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))) {
    const program = programi(liste[0] ?? ad);
    programlar.set(program, [...(programlar.get(program) ?? []), liste]);
  }

  const toplam = dosyalar.length;
  const buyukler = [...programlar]
    .map(([program, liste]) => ({ program, liste, sayi: liste.reduce((s, g) => s + g.length, 0) }))
    .sort((a, b) => b.sayi - a.sayi || a.program.localeCompare(b.program));
  const paylar = buyukler.map((p) => (toplam === 0 ? 0 : Math.round((p.sayi / toplam) * n)));
  // Yuvarlama toplamı n'den saptırır; fark en büyük programdan alınır ya da ona verilir.
  const fark = n - paylar.reduce((s, p) => s + p, 0);
  if (paylar.length > 0) paylar[0] = Math.max(1, (paylar[0] ?? 0) + fark);

  const parcalar: Parca[] = [];
  const kucukler: string[][] = [];
  buyukler.forEach((p, i) => {
    const pay = paylar[i] ?? 0;
    if (pay === 0) {
      kucukler.push(...p.liste);
      return;
    }
    const kendi: Parca[] = Array.from({ length: pay }, () => ({ dosyalar: [] }));
    for (const grup of p.liste) enHafif(kendi).dosyalar.push(...grup);
    parcalar.push(...kendi);
  });
  if (parcalar.length === 0) parcalar.push({ dosyalar: [] });
  for (const grup of kucukler) enHafif(parcalar).dosyalar.push(...grup);
  // Payı en az bir olan program sayısı n'yi aşarsa fazla parça en hafife katılır; hiçbir dosya düşmez.
  while (parcalar.length > n) {
    const fazla = parcalar.pop();
    if (fazla) enHafif(parcalar).dosyalar.push(...fazla.dosyalar);
  }
  while (parcalar.length < n) parcalar.push({ dosyalar: [] });
  return parcalar.map((p) => p.dosyalar.sort());
}

const enHafif = (parcalar: Parca[]): Parca =>
  parcalar.reduce((a, b) => (b.dosyalar.length < a.dosyalar.length ? b : a));

// `eslint .` ile aynı küme: eslint'in kendi yok sayma kuralıyla süzülür. Yapılandırmanın `files` deseni dışında kalan
// uzantılar da eslint'in varsayılanında taranır.
const DESENLER = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'];

export async function lintDosyalari(kok: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: kok });
  const adaylar = globSync(DESENLER, { cwd: kok, exclude: (yol) => /(^|[\\/])(node_modules|\.git)$/.test(yol) })
    .map((yol) => yol.replaceAll('\\', '/'));
  const sonuc: string[] = [];
  for (const yol of [...new Set(adaylar)].sort()) {
    if (!(await eslint.isPathIgnored(resolve(kok, yol)))) sonuc.push(yol);
  }
  return sonuc;
}

export function parcaArgumani(metin: string | undefined): { sira: number; n: number } | null {
  const eslesme = /^(\d+)\/(\d+)$/.exec(metin ?? '');
  if (!eslesme) return null;
  const sira = Number(eslesme[1]);
  const n = Number(eslesme[2]);
  return n >= 1 && sira >= 1 && sira <= n ? { sira, n } : null;
}

async function parcaKos(kok: string, sira: number, n: number): Promise<number> {
  // Ayrıştırıcı tek koşuyu CI değişkeninden ya da eslint komutundan anlar; burada API çağrılır, açıkça bildirilir.
  process.env.TSESTREE_SINGLE_RUN = 'true';
  const dosyalar = parcala(await lintDosyalari(kok), n)[sira - 1] ?? [];
  console.log(`Lint parçası ${String(sira)}/${String(n)}: ${String(dosyalar.length)} dosya`);
  if (dosyalar.length === 0) return 0;
  const eslint = new ESLint({ cwd: kok });
  const sonuclar = await eslint.lintFiles(dosyalar);
  const cikti = await (await eslint.loadFormatter('stylish')).format(sonuclar);
  if (cikti) console.log(cikti);
  return sonuclar.some((s) => s.errorCount > 0 || s.fatalErrorCount > 0) ? 1 : 0;
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Kullanım: `npm run lint:ts` bütün parçaları sırayla koşar; `npm run lint:ts -- --parca 2/4` yalnız birini.
if (dogrudanKosuyor) {
  const kok = fileURLToPath(new URL('../', import.meta.url));
  const i = process.argv.indexOf('--parca');
  if (i !== -1) {
    const parca = parcaArgumani(process.argv[i + 1]);
    if (!parca) {
      console.error('Kullanım: npm run lint:ts -- --parca <sira>/<sayi>');
      process.exit(1);
    }
    process.exitCode = await parcaKos(kok, parca.sira, parca.n);
  } else {
    // Düşen parçadan sonra da koşulur: bütün ihlaller tek koşuda görünür.
    let kod = 0;
    for (let sira = 1; sira <= PARCA_SAYISI; sira++) {
      const argv = [`--max-old-space-size=${String(YIGIN_MB)}`, fileURLToPath(import.meta.url), '--parca', `${String(sira)}/${String(PARCA_SAYISI)}`];
      const durum = spawnSync(process.execPath, argv, { cwd: kok, stdio: 'inherit', shell: false }).status ?? 1;
      if (durum !== 0) kod = durum;
    }
    process.exitCode = kod;
  }
}
