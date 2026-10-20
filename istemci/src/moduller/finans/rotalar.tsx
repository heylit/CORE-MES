import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { FinansCercevesi } from './FinansCercevesi.tsx';
import { GenelGiderOrani } from './GenelGiderOrani.tsx';

// Kök yol ve her ikinci menü maddesi aynı çerçeveye gider; görünümü çerçeve adresten alır (useCerceveGorunumu).
const YOLLAR = ['/finans', '/finans/kayitlar', '/finans/firmalar', '/finans/cekler', '/finans/nakit', '/finans/butce', '/finans/vergi',
  '/finans/durum', '/finans/gelir-tablosu', '/finans/karar-araclari', '/finans/ay-sonu', '/finans/tahminler', '/finans/ayarlar'] as const;

// Genel gider oranı prototipte yoktur; TMI ekranı olarak çerçevenin dışında açılır (prototip değişmez).
export const rotalar: ModulRotasi[] = [
  ...YOLLAR.map((yol) => ({ yol, ekran: FinansCercevesi })),
  { yol: '/finans/genel-gider', ekran: GenelGiderOrani },
];
