// 2465 (2459 a, 2461-4 a): Malzemeler'in kategori ağacı. Hammaddede düğüm malzeme ailesidir (kartın `fam` anahtarı); sarf, demirbaş
// ve hizmette `malzeme_kategorisi` satırıdır. Taban ailelerin adı ekranın FAMS tablosuyla aynıdır (istemci testi denetler): sunucu
// ekranı ithal edemediği için ad buradan okunur. Malzeme ayarında eklenen aileler ayardadır. Zod taşımaz: istemci değer olarak ithal eder.
export const KATEGORI_AGACI_TURLERI = ['hammadde', 'sarf', 'demirbas', 'hizmet'] as const;
export type KategoriAgaciTuru = (typeof KATEGORI_AGACI_TURLERI)[number];
export const TABAN_HAMMADDE_AILELERI: readonly { kod: string; ad: string }[] = [
  { kod: 'metal', ad: 'Metal' }, { kod: 'plastik', ad: 'Plastik' }, { kod: 'elastomer', ad: 'Elastomer' }, { kod: 'kompozit', ad: 'Kompozit' },
  { kod: 'seramik', ad: 'Teknik seramik' }, { kod: 'ahsap', ad: 'Ahşap' }, { kod: 'cam', ad: 'Cam' }, { kod: 'diger', ad: 'Diğer' },
];
// Pasif kategori ve gizli aile `aktif: false` ile listede kalır: eski bağlar adını bulur, yeni seçimde sunulmaz.
export interface KategoriAgaciDugumu { tur: KategoriAgaciTuru; kod: string; ad: string; ustAd: string; aktif: boolean }
