import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ESKI_KOK } from './gorunumler.ts';
import { MalzemeKatalogu } from './MalzemeKatalogu.tsx';
import { MalzemelerYeni } from './yeni/MalzemelerYeni.tsx';

// Yeni ekran menünün adresindedir (572, 527 1 a); Logo gönderimi onun bölümüdür (kart #232, 497/6 a). Prototipin çerçevesi bir süre
// `/malzemeler/eski` altında kalır, kişi menüsündeki "Eski görünüm" açar; görünümleri tek sayfadır, çerçeve yeniden yüklenmez.
export const rotalar: ModulRotasi[] = [
  { yol: '/malzemeler', ekran: MalzemelerYeni },
  { yol: ESKI_KOK, ekran: MalzemeKatalogu },
  { yol: `${ESKI_KOK}/:bolum`, ekran: MalzemeKatalogu },
  { yol: '/malzemeler/:bolum', ekran: MalzemelerYeni },
];
