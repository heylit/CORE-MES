import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { KaliteMerkeziCercevesi } from './KaliteMerkeziCercevesi.tsx';

// Kök yol ve her ikinci menü maddesi (paylasilan/sayfalar/kalite-merkezi.ts) aynı çerçeveye gider; görünümü çerçeve adresten alır.
const YOLLAR = ['/kalite-merkezi', '/kalite-merkezi/parcalar', '/kalite-merkezi/resimler', '/kalite-merkezi/analiz', '/kalite-merkezi/kutuphane',
  '/kalite-merkezi/muayeneler', '/kalite-merkezi/lot-kabul', '/kalite-merkezi/is-emirleri', '/kalite-merkezi/olcum-analizi',
  '/kalite-merkezi/uygunsuzluklar', '/kalite-merkezi/dof', '/kalite-merkezi/cihazlar', '/kalite-merkezi/tedarikciler', '/kalite-merkezi/belgeler',
  '/kalite-merkezi/formlar', '/kalite-merkezi/kullanicilar', '/kalite-merkezi/terimler', '/kalite-merkezi/gostergeler',
  '/kalite-merkezi/degisiklik-izi', '/kalite-merkezi/arsiv', '/kalite-merkezi/ayarlar'] as const;

export const rotalar: ModulRotasi[] = YOLLAR.map((yol) => ({ yol, ekran: KaliteMerkeziCercevesi }));
