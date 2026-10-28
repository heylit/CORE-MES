import type { OlaylarSorgusu, RaporSorgusu, SerilerSorgusu } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';

// Konfigürasyon, İzlenebilirlik, Raporlar ve Olay günlüğü sorgu anahtarları; hepsi modülün kökü altında durur.
const KOK = 'degisiklik-yonetimi';

export const analizAnahtarlari = {
  sonUrunler: () => [KOK, 'son-urunler'] as const,
  konfigurasyon: (malzemeId: number) => [KOK, 'konfigurasyon', malzemeId] as const,
  izlenebilirlik: (sonUrunMalzemeId: number, seriNo: string) => [KOK, 'izlenebilirlik', sonUrunMalzemeId, seriNo] as const,
  seriler: (sorgu: Partial<SerilerSorgusu>) => [KOK, 'seriler', sorgu] as const,
  raporlar: (sorgu: Partial<RaporSorgusu>) => [KOK, 'raporlar', sorgu] as const,
  olaylar: (sorgu: Partial<OlaylarSorgusu>) => [KOK, 'olaylar', sorgu] as const,
};
