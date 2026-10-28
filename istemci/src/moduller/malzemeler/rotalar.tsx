import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { MalzemelerYeni } from './yeni/MalzemelerYeni.tsx';

// Yeni ekran menünün adresindedir (572, 527 1 a); Logo gönderimi onun bölümüdür (kart #232, 497/6 a). Tanımsız bölüm (eski yer imi
// `/malzemeler/eski` dahil) köke döner.
export const rotalar: ModulRotasi[] = [
  { yol: '/malzemeler', ekran: MalzemelerYeni },
  { yol: '/malzemeler/:bolum', ekran: MalzemelerYeni },
];
