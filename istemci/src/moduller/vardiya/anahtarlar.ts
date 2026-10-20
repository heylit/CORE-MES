export const anahtarlar = {
  takvim: ['vardiya', 'takvim'] as const,
  personel: ['vardiya', 'personel'] as const,
  planliDuruslar: (sayfa?: number) => (sayfa === undefined ? ['vardiya', 'planli-duruslar'] as const : ['vardiya', 'planli-duruslar', sayfa] as const),
  fazlaMesai: (baslangic?: string, bitis?: string) => (baslangic === undefined ? ['vardiya', 'fazla-mesai'] as const : ['vardiya', 'fazla-mesai', baslangic, bitis ?? ''] as const),
  durusNedenleri: ['vardiya', 'durus-nedenleri'] as const,
  makineler: ['vardiya', 'makineler'] as const,
  istasyonSecimi: ['vardiya', 'istasyon-secimi'] as const,
  gunlukMesai: (tarih: string) => ['vardiya', 'gunluk-mesai', tarih] as const,
  kaynakTakvimi: (tur: string, id: number, baslangic: string, bitis: string) => ['vardiya', 'kaynak-takvimi', tur, id, baslangic, bitis] as const,
};
