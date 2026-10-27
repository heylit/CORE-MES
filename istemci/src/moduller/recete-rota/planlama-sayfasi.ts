import fontlar from '../../ortak/tasarim/fonts.css?raw';
import archivo from '../../ortak/tasarim/fonts/archivo-latin-wdth-normal.woff2?url';
import archivoEk from '../../ortak/tasarim/fonts/archivo-latin-ext-wdth-normal.woff2?url';
import mono from '../../ortak/tasarim/fonts/jetbrains-mono-latin-wght-normal.woff2?url';
import monoEk from '../../ortak/tasarim/fonts/jetbrains-mono-latin-ext-wght-normal.woff2?url';
import { veriAdresi } from './yazi-tipleri.ts';

// Reçete ve Rota çerçevesi uygulamanın yazı tiplerini de alır (ReceteRotaCercevesi.tsx). Sayfa yalıtılmış çerçevededir: yazı tipi veri adresidir.
const YAZI_DOSYALARI: Readonly<Record<string, string>> = {
  'archivo-latin-wdth-normal.woff2': archivo,
  'archivo-latin-ext-wdth-normal.woff2': archivoEk,
  'jetbrains-mono-latin-wght-normal.woff2': mono,
  'jetbrains-mono-latin-ext-wght-normal.woff2': monoEk,
};

// Uygulamanın yazı tipleri veri adresiyle; okunamayan dosyanın kuralı atlanır (yedek yazı tipi).
export async function planlamaYaziStili(): Promise<string> {
  let stil = fontlar;
  for (const [ad, adres] of Object.entries(YAZI_DOSYALARI)) {
    const veri = await veriAdresi(adres);
    if (veri !== null) stil = stil.replace(`url('./fonts/${ad}')`, `url(${veri})`);
  }
  return stil;
}
