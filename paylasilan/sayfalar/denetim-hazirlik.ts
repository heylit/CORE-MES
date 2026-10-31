import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Denetim Hazırlığı tek sayfadır; ekran kendi bölümlerini (Bugün, Denetimler, KYS, İç denetim, Kalibrasyon, Takvim, Performans,
// Ayarlar) sekme olarak çizer ve görünümleri `/denetim-hazirlik/yeni` altında açar (1392 a). İkinci menü tek maddedir.
export const DENETIM_HAZIRLIK_SAYFALARI = [
  { yol: '/denetim-hazirlik', islem: 'sayfa.denetim-hazirlik', baslik: 'Denetim Hazırlığı', simge: 'search', grup: 'Kalite', sira: 20 },
] as const satisfies readonly SayfaTanimi[];

export const DENETIM_HAZIRLIK_IKINCI_MENU = {
  kok: '/denetim-hazirlik',
  baslik: 'Denetim Hazırlığı',
  simge: 'search',
  gruplar: [{ maddeler: [{ anahtar: 'ana-sayfa', baslik: 'Denetim Hazırlığı', yol: '/denetim-hazirlik', simge: 'search', islem: 'sayfa.denetim-hazirlik' }] }],
} as const satisfies IkinciMenuTanimi;
