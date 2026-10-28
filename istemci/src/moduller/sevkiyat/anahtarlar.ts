export const anahtarlar = {
  gunPlani: (tarih: string) => ['sevkiyat', 'plan', tarih] as const,
  noktalar: ['sevkiyat', 'noktalar'] as const,
  araclar: ['sevkiyat', 'araclar'] as const,
  harita: ['sevkiyat', 'harita'] as const,
  ozet: ['sevkiyat', 'ozet'] as const,
  bekleyenler: ['sevkiyat', 'bekleyenler'] as const,
  tumIsler: (baslangic: string, bitis: string) => ['sevkiyat', 'tum-isler', baslangic, bitis] as const,
  urunSevkleri: (sorgu: string) => ['sevkiyat', 'urun-sevkleri', sorgu] as const,
  trafik: (tarih: string, dakika: number) => ['sevkiyat', 'trafik', tarih, dakika] as const,
  tekRota: (sorgu: string) => ['sevkiyat', 'tek-rota', sorgu] as const,
  arama: (metin: string) => ['sevkiyat', 'arama', metin] as const,
  firmalar: (metin: string) => ['sevkiyat', 'firmalar', metin] as const,
};
