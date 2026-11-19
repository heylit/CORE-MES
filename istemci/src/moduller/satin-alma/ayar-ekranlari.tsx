import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { AyarlarSayfasi } from './SatinAlma.tsx';
import { IstekFormuAyari } from './ayar/IstekFormuAyari.tsx';

// Satın almanın ayarları Sistem Ayarları'nda da açılır; aynı ekran, aynı uçlar, görünürlük menüdeki "Ayarlar" maddesiyle aynı.
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'satin-alma', baslik: 'Satın Alma', simge: 'truck', sira: 20, islem: 'satin-alma.ayar', ekran: AyarlarSayfasi },
  // tedarikçiye giden teklif isteme formu Formlar bölümünde, siparişlerin teklif formunun yanında.
  { anahtar: 'teklif-isteme-formu', baslik: 'Teklif isteme formu', simge: 'file', sira: 20, islem: 'satin-alma.ayar', bolum: 'form', ekran: IstekFormuAyari },
];
