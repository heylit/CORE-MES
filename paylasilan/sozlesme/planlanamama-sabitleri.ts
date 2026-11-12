// zod taşımaz: istemci değer olarak ithal eder (eslint.config.js ZODSUZ).
// 2780: yerleşmeyen işin tek nedeni (kod). Planlanabilirlik sayfası (2779) aynı kodları okur. Metin sunucunun tek cümlesidir; kod ekranın
// bağlantısı ve sayımı içindir.
export const PLANLANAMAMA_NEDENLERI = [
  'sure-bos', 'istasyon-yok', 'istasyon-pasif', 'makine-yok', 'makine-pasif', 'kisi-pasif', 'yetkin-kisi-yok', 'kisi-vardiyasiz', 'takvim-yok',
  'insanli-makine', 'malzeme', 'oncul', 'ufuk', 'rotada-yok', 'bolunmus', 'elle-sirali', 'ek-adaysiz', 'bagli-parti', 'yetki-disi', 'bilinmiyor',
  // 3050 a: bekletilen emrin planda yeri olmayan adımı; motor onu kendiliğinden yerleştirmez.
  'emir-beklemede',
] as const;
export type PlanlanamamaNedeni = (typeof PLANLANAMAMA_NEDENLERI)[number];
// Nedenin düzeltildiği sayfa. Sunucu sayfa adresi bilmez; istemci yeri kendi sayfa adresine çevirir. null: düzeltme planın kendisinde
// değil (öncül zinciri, yetki dışı kaynak).
export const DUZELTME_YERLERI = ['sureler', 'kaynaklar', 'vardiya-personel', 'vardiyalar', 'urun-rotalar', 'stok', 'plan-ayarlari', 'plan'] as const;
export type DuzeltmeYeri = (typeof DUZELTME_YERLERI)[number];
export const NEDEN_DUZELTME_YERI = {
  'sure-bos': 'sureler', 'istasyon-yok': 'urun-rotalar', 'istasyon-pasif': 'kaynaklar', 'makine-yok': 'kaynaklar', 'makine-pasif': 'kaynaklar',
  'kisi-pasif': 'kaynaklar', 'yetkin-kisi-yok': 'kaynaklar', 'kisi-vardiyasiz': 'vardiya-personel', 'takvim-yok': 'vardiyalar',
  'insanli-makine': 'urun-rotalar', malzeme: 'stok', oncul: null, ufuk: 'plan-ayarlari', 'rotada-yok': 'urun-rotalar', bolunmus: 'plan',
  'elle-sirali': 'plan', 'ek-adaysiz': 'plan', 'bagli-parti': null, 'yetki-disi': null, bilinmiyor: null, 'emir-beklemede': null,
} as const satisfies Record<PlanlanamamaNedeni, DuzeltmeYeri | null>;
export const KONTROL_DURUMLARI = ['tamam', 'eksik', 'olculemedi'] as const;
export type KontrolDurumu = (typeof KONTROL_DURUMLARI)[number];
