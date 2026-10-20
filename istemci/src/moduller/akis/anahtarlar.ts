export const anahtarlar = {
  emirler: ['akis', 'emirler'] as const,
  emir: (id: number) => ['akis', 'emir', id] as const,
};
