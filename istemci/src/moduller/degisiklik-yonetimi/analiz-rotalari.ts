import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Izlenebilirlik } from './Izlenebilirlik.tsx';
import { Konfigurasyon } from './Konfigurasyon.tsx';
import { OlayGunlugu } from './OlayGunlugu.tsx';
import { Raporlar } from './Raporlar.tsx';

// Modülün rotalar.tsx dosyası bu diziyi kendi rotalarına katar.
export const analizRotalari: ModulRotasi[] = [
  { yol: '/degisiklik-yonetimi/konfigurasyon', ekran: Konfigurasyon },
  { yol: '/degisiklik-yonetimi/konfigurasyon/:malzemeId', ekran: Konfigurasyon },
  { yol: '/degisiklik-yonetimi/izlenebilirlik', ekran: Izlenebilirlik },
  { yol: '/degisiklik-yonetimi/raporlar', ekran: Raporlar },
  { yol: '/degisiklik-yonetimi/olaylar', ekran: OlayGunlugu },
];
