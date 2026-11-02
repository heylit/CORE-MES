export const anahtarlar = {
  takvim: (baslangic: string, bitis: string) => ['takvim', baslangic, bitis] as const,
  gecikenler: (bugun: string) => ['takvim', 'gecikenler', bugun] as const,
};
