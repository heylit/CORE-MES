import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Baskilar } from './Baskilar.tsx';
import { HazirSablonlar, YaziciDenemesi } from './EtiketMerkezi.tsx';
import { Etiketler } from './Etiketler.tsx';
import { Yazicilar } from './Yazicilar.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/etiket-merkezi', ekran: HazirSablonlar },
  { yol: '/etiket-merkezi/etiketler', ekran: Etiketler },
  { yol: '/etiket-merkezi/deneme', ekran: YaziciDenemesi },
  { yol: '/etiket-merkezi/yazicilar', ekran: Yazicilar },
  { yol: '/etiket-merkezi/baskilar', ekran: Baskilar },
];
