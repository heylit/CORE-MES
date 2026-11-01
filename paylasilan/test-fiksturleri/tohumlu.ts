// Tohumlu rastgele sınama (ADR 0025 kural 7): değişmezi olan hesap, tohumdan türeyen çok sayıda girdiyle koşturulur. Üreteç
// tohumdan belirlenir; aynı tohum aynı girdiyi verir. Başarısız turun tohumu iletiye yazılır, test o tohumla tek tur koşturulur.
// Yeni paket getirmez; sunucu ve istemci testleri aynı yardımcıyı kullanır.

export interface Uretec {
  // [0, 1) aralığında sayı.
  oran(): number;
  // [alt, ust] aralığında tam sayı; iki uç dahil.
  tamSayi(alt: number, ust: number): number;
  sec<T>(dizi: readonly T[]): T;
  olasilik(p: number): boolean;
}

// mulberry32: 32 bitlik durum, hızlı ve tohumdan belirli; kriptografik değildir, yalnız test girdisi üretir.
export function uretec(tohum: number): Uretec {
  let durum = tohum >>> 0;
  const oran = (): number => {
    durum = (durum + 0x6d2b79f5) >>> 0;
    let t = durum;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const tamSayi = (alt: number, ust: number): number => {
    if (!Number.isInteger(alt) || !Number.isInteger(ust) || ust < alt) throw new RangeError(`Geçersiz aralık: ${String(alt)}..${String(ust)}`);
    return alt + Math.floor(oran() * (ust - alt + 1));
  };
  return {
    oran,
    tamSayi,
    sec: <T>(dizi: readonly T[]): T => {
      if (dizi.length === 0) throw new RangeError('Boş diziden seçilmez');
      return dizi[tamSayi(0, dizi.length - 1)] as T;
    },
    olasilik: (p: number): boolean => oran() < p,
  };
}

export const VARSAYILAN_TUR = 200;
// Sabit taban: CI her koşuda aynı girdileri sınar, kırmızı tekrar edilebilir. Tur sayısını artırmak yeni girdi açar.
export const VARSAYILAN_TABAN = 20251101;
export const TOHUM_DEGISKENI = 'TMIV2_TEST_TOHUM';

export interface TurSecenegi {
  tur?: number;
  taban?: number;
  // Verilirse yalnız bu tohumla tek tur koşar (başarısız turu yeniden üretmek için).
  tohum?: number;
}

export class DegismezHatasi extends Error {
  readonly tohum: number;
  constructor(ad: string, tohum: number, neden: unknown) {
    const ileti = neden instanceof Error ? neden.message : String(neden);
    super(`${ad}: değişmez ${String(tohum)} tohumunda bozuldu; yeniden üretmek için ${TOHUM_DEGISKENI}=${String(tohum)}.\n${ileti}`, { cause: neden });
    this.name = 'DegismezHatasi';
    this.tohum = tohum;
  }
}

// Ortam değişkeni metni tohuma çevrilir; boşsa tanımsızdır, sayı değilse açık hatadır (yanlış tohumla yeşil koşu yanıltır).
export function tohumOku(deger: string | undefined): number | undefined {
  if (deger === undefined || deger.trim() === '') return undefined;
  if (!/^\d+$/.test(deger.trim())) throw new RangeError(`${TOHUM_DEGISKENI} negatif olmayan tam sayı olmalı: "${deger}"`);
  const tohum = Number(deger.trim());
  if (!Number.isSafeInteger(tohum)) throw new RangeError(`${TOHUM_DEGISKENI} çok büyük: "${deger}"`);
  return tohum;
}

// Her tur kendi tohumuyla yeni üreteç alır: bir turun tükettiği sayı ötekinin girdisini değiştirmez.
export function turlarlaSina(ad: string, secenek: TurSecenegi, sina: (u: Uretec, tohum: number) => void): number {
  const tohumlar = secenek.tohum !== undefined
    ? [secenek.tohum]
    : Array.from({ length: secenek.tur ?? VARSAYILAN_TUR }, (_, i) => (secenek.taban ?? VARSAYILAN_TABAN) + i);
  if (tohumlar.length === 0) throw new RangeError('En az bir tur koşar');
  for (const tohum of tohumlar) {
    try {
      sina(uretec(tohum), tohum);
    } catch (hata) {
      throw new DegismezHatasi(ad, tohum, hata);
    }
  }
  return tohumlar.length;
}
