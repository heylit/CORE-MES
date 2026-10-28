import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { KaliteMerkeziYeni } from './yeni/KaliteMerkeziYeni.tsx';

// Kök ve ikinci menünün her maddesi (paylasilan/sayfalar/kalite-merkezi.ts) yeni ekrana gider, görünümü adres seçer; tanımsız görünümde
// (eski yer imi `/kalite-merkezi/eski` dahil) ekran "Böyle bir görünüm yok" der. Resim ve modeller yeni stüdyodadır (597 a).
export const rotalar: ModulRotasi[] = [
  { yol: '/kalite-merkezi', ekran: KaliteMerkeziYeni },
  { yol: '/kalite-merkezi/:gorunum', ekran: KaliteMerkeziYeni },
];
