import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Araclar } from './Araclar.tsx';
import { Noktalar } from './Noktalar.tsx';
import { SevkiyatPlani } from './SevkiyatPlani.tsx';
import { TekRota } from './TekRota.tsx';
import { TumIsler } from './TumIsler.tsx';

// Hepsi /sevkiyat sayfasının alt yollarıdır: sayfayı gören kullanıcıya açılır.
export const rotalar: ModulRotasi[] = [
  { yol: '/sevkiyat', ekran: SevkiyatPlani },
  { yol: '/sevkiyat/tum-isler', ekran: TumIsler },
  { yol: '/sevkiyat/tek-rota', ekran: TekRota },
  { yol: '/sevkiyat/noktalar', ekran: Noktalar },
  { yol: '/sevkiyat/araclar', ekran: Araclar },
];
