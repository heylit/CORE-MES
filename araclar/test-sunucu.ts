import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ESZAMANLI_EN_FAZLA = 16;

// Sunucu testlerinde aynı anda koşan dosya sayısı. Boşsa node'un varsayılanı (çekirdek sayısının bir eksiği) kalır:
// yerel makinede eşzamanlı şema kurulumu sahte kırmızı üretmişti (#120); yüksek değer yalnız CI'da verilir.
export function eszamanliOku(deger: string | undefined): number | null {
  if (deger === undefined || deger.trim() === '') return null;
  if (!/^\d+$/.test(deger.trim())) throw new Error(`TMIV2_TEST_ESZAMANLI tam sayı olmalı: "${deger}"`);
  const sayi = Number(deger.trim());
  if (sayi < 1 || sayi > ESZAMANLI_EN_FAZLA) throw new Error(`TMIV2_TEST_ESZAMANLI 1 ile ${ESZAMANLI_EN_FAZLA} arasında olmalı: ${sayi}`);
  return sayi;
}

// CI'da sunucu testleri ayrı makinelerde parçalara bölünür ("1/4"): her parça kendi veritabanıyla dosyaların bir dilimini koşar.
// Biçimi bozuk değer sessizce bütün testleri koşmaz; durur.
export function parcaOku(deger: string | undefined): string | null {
  if (deger === undefined || deger.trim() === '') return null;
  const eslesme = /^(\d+)\/(\d+)$/.exec(deger.trim());
  const sira = Number(eslesme?.[1]);
  const toplam = Number(eslesme?.[2]);
  if (eslesme === null || sira < 1 || toplam < 1 || sira > toplam) throw new Error(`TMIV2_TEST_PARCA "sıra/toplam" biçiminde olmalı (1/4): "${deger}"`);
  return `${sira}/${toplam}`;
}

// CI'da kırmızı test ayrıca uyarı satırı olarak basılır: günlük okunamasa da adı ve iletisi API'den alınır (#641).
// Desenler tırnaksız: koşu kabuksuzdur, node'un kendi glob'u açar.
export function sunucuTestArgv(eszamanli: number | null, ci = false, parca: string | null = null): string[] {
  return [
    '--import', './araclar/ortam-yukle-goc.ts', '--import', './araclar/kablolama-yukle.ts', '--test',
    ...(eszamanli === null ? [] : [`--test-concurrency=${eszamanli}`]),
    ...(parca === null ? [] : [`--test-shard=${parca}`]),
    ...(ci ? ['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=./araclar/test-rapor-github.ts', '--test-reporter-destination=stdout'] : []),
    'sunucu/**/*.test.ts', 'araclar/**/*.test.ts', 'paylasilan/**/*.test.ts',
  ];
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (dogrudanKosuyor) {
  let eszamanli: number | null;
  let parca: string | null;
  try {
    eszamanli = eszamanliOku(process.env['TMIV2_TEST_ESZAMANLI']);
    parca = parcaOku(process.env['TMIV2_TEST_PARCA']);
  } catch (hata) {
    console.error((hata as Error).message);
    process.exit(1);
  }
  const kok = fileURLToPath(new URL('../', import.meta.url));
  process.exit(spawnSync(process.execPath, sunucuTestArgv(eszamanli, process.env['GITHUB_ACTIONS'] === 'true', parca), { cwd: kok, stdio: 'inherit', shell: false }).status ?? 1);
}
