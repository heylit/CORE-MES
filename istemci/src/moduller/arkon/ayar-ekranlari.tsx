import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { ArkonAyarlari } from './ArkonCercevesi.tsx';

// Arkon MES > Ayarlar menü maddesiyle aynı işlem (paylasilan/sayfalar/arkon.ts ARKON_IKINCI_MENU 'ayarlar').
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'arkon', baslik: 'Üretim Hazırlık', simge: 'cube', sira: 50, islem: 'sayfa.arkon', ekran: ArkonAyarlari },
];
