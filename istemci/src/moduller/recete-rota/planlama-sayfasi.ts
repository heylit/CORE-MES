import fontlar from '../../ortak/tasarim/fonts.css?raw';
import tokens from '../../ortak/tasarim/tokens.css?raw';
import temel from '../../ortak/tasarim/temel.css?raw';
import kabuk from '../../ortak/arayuz/kabuk.css?raw';
import ikinciMenu from '../../ortak/arayuz/ikinci-menu.css?raw';
import dugme from '../../ortak/arayuz/dugme.css?raw';
import kart from '../../ortak/arayuz/kart.css?raw';
import rozet from '../../ortak/arayuz/rozet.css?raw';
import alan from '../../ortak/arayuz/alan.css?raw';
import sekmeler from '../../ortak/arayuz/sekmeler.css?raw';
import tablo from '../../ortak/arayuz/tablo.css?raw';
import sayiKarti from '../../ortak/arayuz/sayi-karti.css?raw';
import pencere from '../../ortak/arayuz/pencere.css?raw';
import bildirim from '../../ortak/arayuz/bildirim.css?raw';
import simge from '../../ortak/arayuz/simge.css?raw';
import archivo from '../../ortak/tasarim/fonts/archivo-latin-wdth-normal.woff2?url';
import archivoEk from '../../ortak/tasarim/fonts/archivo-latin-ext-wdth-normal.woff2?url';
import mono from '../../ortak/tasarim/fonts/jetbrains-mono-latin-wght-normal.woff2?url';
import monoEk from '../../ortak/tasarim/fonts/jetbrains-mono-latin-ext-wght-normal.woff2?url';
import { DOLGULU, SIMGELER } from '../../ortak/tasarim/simgeler.ts';
import { veriAdresi } from './yazi-tipleri.ts';

// Planlama çerçevesi uygulamanın görünümüyle çizilir: ortak tasarım değişkenleri, temel stil ve arayüz parçalarının stili, simgeler
// ve yazı tipleri açılışta sayfaya konur (planlama-derle.ts yer tutucuları). Sayfa yalıtılmış çerçevededir: yazı tipi veri adresidir.
const YER_STIL = '/*TMI-ORTAK-STIL*/';
const YER_SIMGE = '/*TMI-SIMGELER*/';
const ORTAK_STIL = [tokens, temel, kabuk, ikinciMenu, dugme, kart, rozet, alan, sekmeler, tablo, sayiKarti, pencere, bildirim, simge];
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

// Betiğe gömülen JSON betiği kapatamasın.
const betikJson = (deger: unknown): string => JSON.stringify(deger).replace(/</g, '\\u003c');

export function planlamaSayfasiKur(prototip: string): string {
  if (!prototip.includes(YER_STIL) || !prototip.includes(YER_SIMGE)) throw new Error('Planlama sayfası yer tutucuları yok.');
  const simgeler = `const IC = ${betikJson(SIMGELER)};\nconst DOLGU = new Set(${betikJson([...DOLGULU])});`;
  return prototip.replace(YER_STIL, () => ORTAK_STIL.join('\n')).replace(YER_SIMGE, () => simgeler);
}
