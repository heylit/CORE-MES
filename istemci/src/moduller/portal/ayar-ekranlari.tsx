import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { PortalAyarlari } from './PortalAyarlari.tsx';

// Portalın onay ve bildirim kuralları yalnız Sistem Ayarları'ndadır (kart #931); işlem portal kurulumu.
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'portal', baslik: 'Müşteri ve Tedarikçi Portalı', simge: 'chart', sira: 80, islem: 'portal.yonet', ekran: PortalAyarlari },
];
