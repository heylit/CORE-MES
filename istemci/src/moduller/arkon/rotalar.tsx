import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ArkonCercevesi, PlanKuyrugu, UretimTerminali } from './ArkonCercevesi.tsx';
import { TmiYansimalari } from './TmiYansimalari.tsx';

// Arkon sayfaları TMI adresinde de durur (/arkon/kalite gibi): bağlantı paylaşılır, sonra sayfa istenen yere taşınabilir.
export const rotalar: ModulRotasi[] = [
  // Yalın /arkon rolüne göre Pano'yu ya da operatör ekranını açar.
  { yol: '/arkon', ekran: ArkonCercevesi },
  // Operatör menüde gezip döndüğünde terminal yeniden yüklenmez, yarım iş yerinde kalır.
  { yol: '/uretim-terminali', ekran: UretimTerminali, kalici: true },
  { yol: '/kuyruk', ekran: PlanKuyrugu },
  // TMI ekranı: çerçeve dışında, /arkon/:sayfa'dan önce eşlenir.
  { yol: '/arkon/tmi-yansimalari', ekran: TmiYansimalari },
  { yol: '/arkon/:sayfa', ekran: ArkonCercevesi },
];
