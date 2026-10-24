import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { LogoGonderimi } from './LogoGonderimi.tsx';
import { MalzemeKatalogu } from './MalzemeKatalogu.tsx';
import { MalzemelerYeni } from './yeni/MalzemelerYeni.tsx';

// Prototipin görünümleri tek sayfadır: menü maddeleri aynı çerçeveye gelir, görünümü adres seçer; çerçeve yeniden yüklenmez.
// Logo gönderimi prototipte yoktur, kendi sayfasıdır (kart #232).
export const rotalar: ModulRotasi[] = [
  { yol: '/malzemeler', ekran: MalzemeKatalogu },
  { yol: '/malzemeler/logo', ekran: LogoGonderimi },
  { yol: '/malzemeler/:bolum', ekran: MalzemeKatalogu },
  // TS geçişi (199 b): doğal ekran ikinci yolda, yalnız yöneticide; `/malzemeler/yeni` Yeni kart maddesinin yolu olduğu için ayrı ad.
  { yol: '/malzemeler/yeni-ekran', ekran: MalzemelerYeni },
  { yol: '/malzemeler/yeni-ekran/:bolum', ekran: MalzemelerYeni },
];
