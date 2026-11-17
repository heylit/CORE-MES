// zod taşımaz: istemci değer olarak ithal eder (eslint ZODSUZ listesi).
// 3398 (3398 a, surum 4): stokta ölçü ve kaliteyle arama. Kartın ölçüsü Malzemeler'in hammadde kaydındadır (form + dims); burada
// yalnız aramanın hangi ölçüyü kesit, hangisini boy saydığı durur. Anahtarlar kart föyündeki dims anahtarlarıdır.
export const OLCULU_FORMLAR = ['cubuk', 'altigen', 'lama', 'levha', 'boru', 'kutu', 'kosebent', 'blok', 'disk'] as const;
export type OlculuForm = (typeof OLCULU_FORMLAR)[number];
export const OLCU_ANAHTARLARI = ['d', 's', 'a', 'b', 't', 'D', 'h', 'w', 'l'] as const;
export type OlcuAnahtari = (typeof OLCU_ANAHTARLARI)[number];

// kesit: istenenden küçük olamaz, en çok fazla pay kadar büyük olabilir. boy: parça boyu (+ kesme) bundan çıkar; null bütün parça kullanılır.
// en: yalnız levhada, plakanın öbür kenarı.
export const FORM_OLCULERI: Readonly<Record<OlculuForm, { kesit: readonly OlcuAnahtari[]; boy: OlcuAnahtari | null; en: OlcuAnahtari | null }>> = {
  cubuk: { kesit: ['d'], boy: 'l', en: null },
  altigen: { kesit: ['s'], boy: 'l', en: null },
  lama: { kesit: ['a', 'b'], boy: 'l', en: null },
  levha: { kesit: ['t'], boy: 'l', en: 'w' },
  boru: { kesit: ['D', 't'], boy: 'l', en: null },
  kutu: { kesit: ['a', 'b', 't'], boy: 'l', en: null },
  kosebent: { kesit: ['a', 'b', 't'], boy: 'l', en: null },
  blok: { kesit: ['a', 'b', 'h'], boy: null, en: null },
  disk: { kesit: ['d', 't'], boy: null, en: null },
};
export const FORM_ADLARI: Readonly<Record<OlculuForm, string>> = {
  cubuk: 'Çubuk', altigen: 'Altıgen', lama: 'Lama', levha: 'Levha', boru: 'Boru', kutu: 'Kutu profil', kosebent: 'Köşebent', blok: 'Blok', disk: 'Disk',
};
export const OLCU_ETIKETLERI: Readonly<Record<OlculuForm, Partial<Record<OlcuAnahtari, string>>>> = {
  cubuk: { d: 'Çap' }, altigen: { s: 'Anahtar ağzı' }, lama: { a: 'Genişlik', b: 'Kalınlık' }, levha: { t: 'Kalınlık' },
  boru: { D: 'Dış çap', t: 'Et kalınlığı' }, kutu: { a: 'Genişlik', b: 'Yükseklik', t: 'Et kalınlığı' },
  kosebent: { a: 'Kol 1', b: 'Kol 2', t: 'Et kalınlığı' }, blok: { a: 'En', b: 'Boy', h: 'Yükseklik' }, disk: { d: 'Çap', t: 'Kalınlık' },
};

// Fazla pay (3398 surum 4 madde 11): yalnız tam, mm ya da yüzde; yüzdede en az mm alt sınırdır. Varsayılan %15, en az 3 mm.
export const PAY_TURLERI = ['tam', 'mm', 'yuzde'] as const;
export type PayTuru = (typeof PAY_TURLERI)[number];
export const VARSAYILAN_PAY = { tur: 'yuzde', deger: 15, enAzMm: 3 } as const;
export const VARSAYILAN_KESME_MM = 3;
// Kesimden kalan boy bunun altındaysa ekran hurdayı önerir; karar kaydedenindir.
export const ARTIK_HURDA_ESIGI_MM = 150;
