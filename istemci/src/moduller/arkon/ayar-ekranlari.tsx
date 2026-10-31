import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { ArkonAyarBolumu } from './yeni/ArkonYeni.tsx';

// Üretim Hazırlık > Ayarlar menü maddesiyle aynı işlem (paylasilan/sayfalar/arkon.ts ARKON_IKINCI_MENU 'ayarlar') ve aynı ekran.
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'arkon', baslik: 'Üretim Hazırlık', simge: 'cube', sira: 50, islem: 'sayfa.arkon', ekran: ArkonAyarBolumu },
];
