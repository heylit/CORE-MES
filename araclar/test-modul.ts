import { spawnSync } from 'node:child_process';
import { existsSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kabuksuzArgv } from './paket-bin.ts';

export interface ModulTestKomutu {
  taraf: 'sunucu' | 'istemci';
  // Tarafın modül klasörü; yoksa komut koşmaz.
  klasor: string;
  komut: string;
  argumanlar: string[];
}

// Modül testinin tek tanımı: teslim denemesi de komutlarını buradan alır.
export function modulTestKomutlari(ad: string): ModulTestKomutu[] {
  const sunucu = `sunucu/moduller/${ad}`;
  const istemci = `istemci/src/moduller/${ad}`;
  return [
    // Desen tırnaksız: koşu kabuksuzdur, tırnak desenin parçası olur, hiçbir dosya eşleşmez ve koşu sıfır testle
    // yeşil biter. Modül adı boşluk ya da kabuk işareti taşıyamaz (kullanım deseni).
    { taraf: 'sunucu', klasor: sunucu, komut: 'node', argumanlar: ['--import', './araclar/ortam-yukle-goc.ts', '--import', './araclar/kablolama-yukle.ts', '--test', `${sunucu}/**/*.test.ts`] },
    {
      taraf: 'istemci', klasor: istemci, komut: 'npx',
      argumanlar: ['vitest', 'run', '--config', 'istemci/vite.config.ts', '--passWithNoTests', `src/moduller/${ad}/`],
    },
  ];
}

// Koşulan argv: iki platformda da kabuksuz ve aynı. `npx` Windows'ta kabuk betiğidir; onun yerine paketin giriş
// dosyası node ile çağrılır. Desen kabuktan geçmediği için tırnaksızdır ve node'un kendi glob'u açar.
export const kosuArgv = (k: ModulTestKomutu, kok: string): string[] =>
  kabuksuzArgv(k.komut === 'npx' ? k.argumanlar : [k.komut, ...k.argumanlar], kok);

// Node, hiçbir dosyayla eşleşmeyen deseni hata saymaz: sıfır testle yeşil biter. Desenin bulduğu dosya önceden sayılır ki
// eşleşmeyen desen (platform farkı, yanlış yol) sessiz yeşil yerine kırmızı versin.
export function sunucuTestDosyalari(k: ModulTestKomutu, kok: string): string[] {
  const desen = k.argumanlar.at(-1) ?? '';
  return globSync(desen, { cwd: kok });
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Kullanım: npm run test:modul -- <ad>. Yalnız o modülün sunucu ve istemci testlerini koşar.
if (dogrudanKosuyor) {
  const ad = process.argv[2];
  if (!ad || !/^[a-z][a-z0-9-]*$/.test(ad)) {
    console.error('Kullanım: npm run test:modul -- <modul_adi>');
    process.exit(1);
  }

  const kok = fileURLToPath(new URL('../', import.meta.url));
  const komutlar = modulTestKomutlari(ad).filter((k) => existsSync(resolve(kok, k.klasor)));
  if (komutlar.length === 0) {
    console.error(`Modül bulunamadı: ${ad}`);
    process.exit(1);
  }

  let kod = 0;
  for (const k of komutlar) {
    if (k.taraf === 'sunucu') {
      const dosyalar = sunucuTestDosyalari(k, kok);
      if (dosyalar.length === 0) {
        console.error(`Sunucu test deseni hiçbir dosya bulmadı: ${k.argumanlar.at(-1) ?? ''}`);
        process.exit(1);
      }
      console.log(`Sunucu: ${String(dosyalar.length)} test dosyası`);
    }
    const [komut = '', ...argumanlar] = kosuArgv(k, kok);
    kod ||= spawnSync(komut, argumanlar, { cwd: kok, stdio: 'inherit', shell: false }).status ?? 1;
  }
  process.exit(kod);
}
