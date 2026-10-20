import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { AyarlarSayfasi } from './SatinAlma.tsx';

// Satın almanın ayarları Sistem Ayarları'nda da açılır; aynı ekran, aynı uçlar, görünürlük menüdeki "Ayarlar" maddesiyle aynı.
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'satin-alma', baslik: 'Satın Alma', simge: 'truck', sira: 20, islem: 'satin-alma.ayar', ekran: AyarlarSayfasi },
];
