import { z } from 'zod';

// Sayfalı listenin ortak sözleşmesi. Alan adları istemcinin liste durumu kancasıyla aynıdır; modül kendi
// süzgeçlerini yanına yazar: `z.object({ ...listeSorguAlanlari(['ad', 'kod']), metin: ... })`.
export const SIRALAMA_YONLERI = ['artan', 'azalan'] as const;
export type SiralamaYonu = (typeof SIRALAMA_YONLERI)[number];

export const VARSAYILAN_SAYFA_BOYU = 50;
// Sunucunun uyguladığı üst sınır: aşan istek reddedilmez, bu değere çekilir ve cevapta uygulanan boy döner.
export const AZAMI_SAYFA_BOYU = 200;
// Atlanacak satır sayısı (sayfa x boy) veritabanı tam sayısı içinde kalır. Aşan sayfa reddedilmez, bu değere
// çekilir: taşan sayfa da çekildiği için elle yazılmış adres hata ekranı vermez.
export const AZAMI_SAYFA = 100_000;
// Veritabanı tam sayısının üst sınırı; iş kuralı değildir.
const TAM_SAYI_UST = 2147483647;

// Sorgu dizgesinden metin gelir: sayı zorlanır. Boş metin 0'a döner ve alt sınıra takılır.
export const sayfaSorguAlanlari = {
  sayfa: z.coerce.number().int().min(1).transform((sayfa) => Math.min(sayfa, AZAMI_SAYFA)).default(1),
  // Verilmezse sunucunun varsayılanı uygulanır.
  sayfaBoyu: z.coerce.number().int().min(1).max(TAM_SAYI_UST).optional(),
};

// Sıralama alanı serbest metin değildir: yalnız modülün saydığı anahtarlar geçer, başkası 400 olur.
// Anahtar SQL'e yazılmaz; sunucuda modülün sabit sütun eşlemesine çevrilir.
export function siralamaSorguAlanlari<const A extends readonly [string, ...string[]]>(alanlar: A) {
  return {
    sirala: z.enum(alanlar).optional(),
    yon: z.enum(SIRALAMA_YONLERI).default('artan'),
  };
}

export function listeSorguAlanlari<const A extends readonly [string, ...string[]]>(alanlar: A) {
  return { ...sayfaSorguAlanlari, ...siralamaSorguAlanlari(alanlar) };
}

// `toplam` sayılmadıysa null'dır (0 "hiç kayıt yok" demektir). `sayfa` ve `sayfaBoyu` isteneni değil uygulananı
// taşır: taşan sayfa son sayfaya, sınırı aşan boy üst sınıra çekilmiş olabilir.
export function listeCevapSemasi<S extends z.ZodTypeAny>(satir: S) {
  return z.object({
    satirlar: z.array(satir),
    toplam: z.number().int().min(0).nullable(),
    sayfa: z.number().int().min(1),
    sayfaBoyu: z.number().int().min(1),
  });
}

export interface SayfaliListe<T> {
  satirlar: T[];
  toplam: number | null;
  sayfa: number;
  sayfaBoyu: number;
}
