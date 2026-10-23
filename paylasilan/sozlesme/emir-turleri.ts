// zod taşımaz: istemci değer olarak ithal eder (eslint.config.js ZODSUZ).
// Emrin türü (kart #699): emrin ne için açıldığını söyleyen etikettir; iş emri adım türünden (IS_EMRI_TURLERI) ayrıdır, kural değiştirmez.
export const EMIR_TURLERI = ['seri', 'fai', 'numune', 'prototip', 'stok', 'rework', 'bakim_deneme', 'fason'] as const;
export const EMIR_TURU_ADLARI: Record<(typeof EMIR_TURLERI)[number], string> = {
  seri: 'Seri', fai: 'FAI', numune: 'Numune', prototip: 'Prototip', stok: 'Stoğa üretim', rework: 'Rework', bakim_deneme: 'Bakım ve deneme', fason: 'Fason',
};
