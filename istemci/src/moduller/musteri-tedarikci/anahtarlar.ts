// Firma kartı sorguları. Yazma sonrası liste önekiyle geçersiz kılınır; ayrıntı yazma cevabından yerine konur.
export const anahtarlar = {
  hepsi: ['musteri-tedarikci'] as const,
  listeler: ['musteri-tedarikci', 'liste'] as const,
  liste: (sorgu: object) => ['musteri-tedarikci', 'liste', sorgu] as const,
  ayrinti: (id: number) => ['musteri-tedarikci', 'ayrinti', id] as const,
  karne: (id: number) => ['musteri-tedarikci', 'karne', id] as const,
  // Değerlendirme matrisi ve ağırlıkları (2456): elle değerlendirme ve ağırlık değişikliği ikisini de geçersiz kılar.
  degerlendirme: () => ['musteri-tedarikci', 'degerlendirme'] as const,
  agirliklar: () => ['musteri-tedarikci', 'degerlendirme', 'agirliklar'] as const,
  // Logo cari araması (2118): her arama Logo'ya gider; sonuç kısa süre tutulur, yazma sonrası eşleşmeler yeniden okunur.
  logoCari: (q: string) => ['musteri-tedarikci', 'logo-cari', q] as const,
};
