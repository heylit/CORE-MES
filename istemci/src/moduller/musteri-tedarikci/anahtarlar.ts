// Firma kartı sorguları. Yazma sonrası liste önekiyle geçersiz kılınır; ayrıntı yazma cevabından yerine konur.
export const anahtarlar = {
  hepsi: ['musteri-tedarikci'] as const,
  listeler: ['musteri-tedarikci', 'liste'] as const,
  liste: (sorgu: object) => ['musteri-tedarikci', 'liste', sorgu] as const,
  ayrinti: (id: number) => ['musteri-tedarikci', 'ayrinti', id] as const,
};
