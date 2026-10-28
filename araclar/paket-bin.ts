import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

// Kurulu paketlerin komutlarını kabuksuz çağrılabilir argv'ye çevirir; teslim denemesi ve modül testi ortak kullanır.

// Komut adını veren paket; adı paketinkinden farklı olanlar.
const KOMUT_PAKETI: Record<string, string> = { tsc: 'typescript' };

export type BinCoz = (agac: string, ad: string) => string;

// Ağaçtaki kurulu paketin çalıştırılabilir betiği. `node_modules/.bin` Windows'ta kabuk betiğidir; doğrudan dosya verilir.
export const binYolu: BinCoz = (agac, ad) => {
  const paket = KOMUT_PAKETI[ad] ?? ad;
  if (!/^[a-z0-9-]+$/.test(paket)) throw new Error(`Komut çözülemedi: ${ad}`);
  const kok = join(agac, 'node_modules', paket);
  const tanim = JSON.parse(readFileSync(join(kok, 'package.json'), 'utf8')) as { bin?: string | Record<string, string> };
  const goreli = typeof tanim.bin === 'string' ? tanim.bin : tanim.bin?.[ad];
  if (goreli === undefined) throw new Error(`Komut çözülemedi: ${paket} paketi "${ad}" komutu vermiyor`);
  return join(kok, goreli);
};

// Kabuksuz çağrı: `node` süreçteki node'dur, öteki komut paketin giriş dosyasıyla node'a verilir. Böylece
// Windows'ta ve Linux'ta aynı argv koşar; Windows'taki `.cmd` kısayolu için kabuk gerekmez.
export const kabuksuzArgv = (sozcukler: readonly string[], agac: string, binCoz: BinCoz = binYolu): string[] => {
  const [ilk = '', ...kalan] = sozcukler.map((s) => s.replace(/^"(.*)"$/, '$1'));
  return ilk === 'node' ? [process.execPath, ...kalan] : [process.execPath, binCoz(agac, ilk), ...kalan];
};

// npm'in giriş betiği: `npm run` içinden açılan süreçte ortamda yazar. Bekçi ya da başlangıç betiği node'u doğrudan açınca
// değişken gelmez; o zaman node'un yanında aranır (Windows kurulumu node.exe'nin yanında, Linux `<önek>/lib` altında).
export function npmCliBul(
  ortam: NodeJS.ProcessEnv = process.env, node: string = process.execPath, varMi: (yol: string) => boolean = existsSync,
): string | null {
  const adaylar = [
    ortam['npm_execpath'] ?? '',
    join(dirname(node), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(node), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  return adaylar.find((yol) => basename(yol) === 'npm-cli.js' && varMi(yol)) ?? null;
}
