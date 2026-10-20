export const anahtarlar = {
  kok: ['kalibrasyon'] as const,
  ozet: ['kalibrasyon', 'ozet'] as const,
  liste: (ara: string) => ['kalibrasyon', 'liste', ara] as const,
  ayrinti: (id: number) => ['kalibrasyon', 'ayrinti', id] as const,
  turler: ['kalibrasyon', 'turler'] as const,
};
