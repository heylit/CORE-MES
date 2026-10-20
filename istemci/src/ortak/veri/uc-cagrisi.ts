import { api, type OkumaSecenegi, type YazmaSecenegi } from './api.ts';

// Modülün uç haritası sözleşmede tip olarak durur ve buraya `import type` ile gelir (zod pakete girmez):
// anahtar 'YONTEM /yol/:parametre', değer o ucun sorgu, gövde ve cevap tipi. Yol ile cevap tipi tek tanımdan okunur.
export interface UcTipi {
  sorgu?: object;
  govde?: unknown;
  cevap: unknown;
}

type Yontem = 'GET' | 'POST' | 'PUT' | 'DELETE';

type YontemYollari<U, Y extends Yontem> = keyof U extends infer K ? (K extends `${Y} ${infer Yol}` ? Yol : never) : never;

type YolParametresi<Yol extends string> =
  Yol extends `${string}:${infer Ad}/${infer Kalan}` ? Ad | YolParametresi<`/${Kalan}`>
    : Yol extends `${string}:${infer Ad}` ? Ad
      : never;

type ParametreGirdisi<Yol extends string> =
  [YolParametresi<Yol>] extends [never] ? { parametre?: undefined } : { parametre: Record<YolParametresi<Yol>, string | number> };

type GovdeGirdisi<T> = T extends { govde: infer G } ? { govde: G } : { govde?: undefined };

// Adrese yazılabilen değerler; dizi, nesne ve tarih metne sessizce dönmesin diye sorgu alanı başka tip taşıyamaz.
export type SorguDegeri = string | number | boolean | null | undefined;

// Bütün alanları isteğe bağlı sorgu yazılmayabilir; zorunlu alanı olan yazılmak zorundadır.
type SorguGirdisi<T> =
  T extends { sorgu: infer S }
    ? (S extends { [K in keyof S]: SorguDegeri } ? (Record<never, never> extends S ? { sorgu?: S } : { sorgu: S }) : { sorgu: never })
    : { sorgu?: undefined };

export type UcGirdisi<U, Y extends Yontem, Yol extends string> =
  `${Y} ${Yol}` extends keyof U
    ? ParametreGirdisi<Yol> & GovdeGirdisi<U[`${Y} ${Yol}`]> & SorguGirdisi<U[`${Y} ${Yol}`]> & (Y extends 'GET' ? OkumaSecenegi : YazmaSecenegi)
    : never;

export type UcCevabi<U, Y extends Yontem, Yol extends string> =
  `${Y} ${Yol}` extends keyof U ? (U[`${Y} ${Yol}`] extends { cevap: infer C } ? C : never) : never;

// Zorunlu alanı olmayan uçta ikinci bağımsız değişken yazılmaz.
type Girdiler<G> = Record<never, never> extends G ? [girdi?: G] : [girdi: G];

type BirlesimMi<T, Tum = T> = T extends unknown ? ([Tum] extends [T] ? false : true) : never;

// Yol tek bir uç olmalıdır: koşula göre seçilen yolda (birleşim) hangi ucun girdisinin zorunlu olduğu bilinemez.
type Cagri<U, Y extends Yontem> = <Yol extends YontemYollari<U, Y>>(
  yol: Yol,
  ...girdi: BirlesimMi<Yol> extends false ? Girdiler<UcGirdisi<U, Y, Yol>> : [yolTekUcOlmali: never]
) => Promise<UcCevabi<U, Y, Yol>>;

export interface UcCagrisi<U> {
  get: Cagri<U, 'GET'>;
  post: Cagri<U, 'POST'>;
  put: Cagri<U, 'PUT'>;
  sil: Cagri<U, 'DELETE'>;
}

interface HamGirdi extends YazmaSecenegi {
  parametre?: Record<string, string | number>;
  sorgu?: object;
  govde?: unknown;
}

// Sorgu anahtarı ya da bağlantı kurmak için de kullanılır: çağrıyla aynı adresi verir.
export function yolKur(yol: string, parametre: Record<string, string | number> = {}, sorgu: object = {}): string {
  // Sorgu tek yoldan verilir; yolda yazılan sorgu ikinci bir '?' üretir.
  if (yol.includes('?')) throw new Error(`Yolda sorgu yazılmaz, sorgu ayrı verilir: ${yol}`);
  const dolu = yol.replace(/:([A-Za-z0-9_]+)/g, (_tam, ad: string) => {
    const deger = parametre[ad];
    const metin = deger === undefined || Number.isNaN(deger) ? '' : String(deger);
    // Boş değer yolu kaydırır ('/a//b'), '.' ve '..' tarayıcıda yolu değiştirir ('/a/../b' -> '/b'): kullanıcının yazdığı
    // kodla komut başka uca gitmesin. Eksik parametre ve NaN da '/kayitlar/undefined' diye sunucuya gitmez.
    if (metin === '' || metin === '.' || metin === '..') {
      throw new Error(`Yol parametresi eksik ya da geçersiz: ${ad} (${yol})`);
    }
    return encodeURIComponent(metin);
  });
  const arama = new URLSearchParams();
  for (const [ad, deger] of Object.entries(sorgu) as [string, unknown][]) {
    // Verilmeyen süzgeç adrese yazılmaz: 'durum=undefined' sunucuda doğrulama hatasıdır.
    if (deger === undefined || deger === null) continue;
    if (typeof deger !== 'string' && typeof deger !== 'number' && typeof deger !== 'boolean') {
      throw new Error(`Sorgu değeri metin, sayı ya da mantıksal olmalı: ${ad} (${yol})`);
    }
    arama.append(ad, String(deger));
  }
  const metin = arama.toString();
  return metin === '' ? dolu : `${dolu}?${metin}`;
}

export function ucCagrisi<U extends { [K in keyof U]: UcTipi }>(): UcCagrisi<U> {
  // async: adres kurulamazsa da çağıran tek yoldan (reddedilen söz) öğrenir.
  const cagir = (yontem: 'get' | 'post' | 'put' | 'sil') => async (yol: string, girdi: HamGirdi = {}): Promise<unknown> => {
    const { parametre, sorgu, govde, istekKimligi, ...secenek } = girdi;
    const adres = yolKur(yol, parametre, sorgu);
    if (yontem === 'get') return api.get(adres, secenek);
    const yazma: YazmaSecenegi = istekKimligi === undefined ? secenek : { ...secenek, istekKimligi };
    return yontem === 'sil' ? api.sil(adres, yazma) : api[yontem](adres, govde, yazma);
  };
  // Tipli yüz yalnız derleme zamanındadır; çalışma zamanında dört yöntem aynı kurucudan çıkar.
  return { get: cagir('get'), post: cagir('post'), put: cagir('put'), sil: cagir('sil') } as UcCagrisi<U>;
}
