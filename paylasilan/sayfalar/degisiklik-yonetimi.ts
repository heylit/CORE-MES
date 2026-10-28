import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Değişiklik yönetimi ana menüde tek sayfa; bölümleri ikinci menüde. Kalite grubunda (1140 a varsayımı): CCB, ilk parça ve MRB
// kararlarının sahibi Kalite'dir. Aşama 1'de maddeler sayfa işlemiyle görünür; veri yetkisi sunucuda (1126 a).
export const DEGISIKLIK_YONETIMI_SAYFALARI = [
  { yol: '/degisiklik-yonetimi', islem: 'sayfa.degisiklik-yonetimi', baslik: 'Değişiklik Yönetimi', simge: 'file', grup: 'Kalite', sira: 30 },
] as const satisfies readonly SayfaTanimi[];

export const DEGISIKLIK_YONETIMI_IKINCI_MENU = {
  kok: '/degisiklik-yonetimi',
  baslik: 'Değişiklik Yönetimi',
  simge: 'file',
  gruplar: [
    {
      maddeler: [
        { anahtar: 'gorevlerim', baslik: 'Görevlerim', yol: '/degisiklik-yonetimi', simge: 'bell', islem: 'sayfa.degisiklik-yonetimi' },
        { anahtar: 'konfigurasyon', baslik: 'Konfigürasyon', yol: '/degisiklik-yonetimi/konfigurasyon', simge: 'layers', islem: 'sayfa.degisiklik-yonetimi' },
        { anahtar: 'degisiklikler', baslik: 'Değişiklikler', yol: '/degisiklik-yonetimi/degisiklikler', simge: 'list', islem: 'sayfa.degisiklik-yonetimi' },
      ],
    },
    {
      baslik: 'Kalite',
      maddeler: [
        { anahtar: 'izlenebilirlik', baslik: 'İzlenebilirlik', yol: '/degisiklik-yonetimi/izlenebilirlik', simge: 'route', islem: 'sayfa.degisiklik-yonetimi' },
      ],
    },
    {
      baslik: 'Analiz',
      maddeler: [
        { anahtar: 'raporlar', baslik: 'Raporlar', yol: '/degisiklik-yonetimi/raporlar', simge: 'chart', islem: 'sayfa.degisiklik-yonetimi' },
        { anahtar: 'olaylar', baslik: 'Olay günlüğü', yol: '/degisiklik-yonetimi/olaylar', simge: 'clock', islem: 'sayfa.degisiklik-yonetimi' },
      ],
    },
  ],
} as const satisfies IkinciMenuTanimi;
