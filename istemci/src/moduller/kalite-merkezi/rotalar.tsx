import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { KaliteMerkeziCercevesi } from './KaliteMerkeziCercevesi.tsx';
import { KaliteMerkeziYeni } from './yeni/KaliteMerkeziYeni.tsx';

// Kök yol ve her ikinci menü maddesi (paylasilan/sayfalar/kalite-merkezi.ts) aynı çerçeveye gider; görünümü çerçeve adresten alır.
const YOLLAR = ['/kalite-merkezi', '/kalite-merkezi/parcalar', '/kalite-merkezi/resimler', '/kalite-merkezi/analiz', '/kalite-merkezi/kutuphane',
  '/kalite-merkezi/muayeneler', '/kalite-merkezi/lot-kabul', '/kalite-merkezi/is-emirleri', '/kalite-merkezi/olcum-analizi',
  '/kalite-merkezi/uygunsuzluklar', '/kalite-merkezi/dof', '/kalite-merkezi/cihazlar', '/kalite-merkezi/tedarikciler', '/kalite-merkezi/belgeler',
  '/kalite-merkezi/formlar', '/kalite-merkezi/kullanicilar', '/kalite-merkezi/terimler', '/kalite-merkezi/gostergeler',
  '/kalite-merkezi/degisiklik-izi', '/kalite-merkezi/arsiv', '/kalite-merkezi/ayarlar'] as const;

// TS geçişi (199 b): yeni ekran ikinci yolda, alıma kadar yalnız yöneticide (YeniEkranKapisi).
export const rotalar: ModulRotasi[] = [
  ...YOLLAR.map((yol) => ({ yol, ekran: KaliteMerkeziCercevesi })),
  { yol: '/kalite-merkezi/yeni', ekran: KaliteMerkeziYeni },
  { yol: '/kalite-merkezi/yeni/:gorunum', ekran: KaliteMerkeziYeni },
];
