import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { GorevSablonlari } from './GorevSablonlari.tsx';
import { HazirlikKademeAyari } from './HazirlikKademeAyari.tsx';
import { HazirlikMaddeleri } from './HazirlikMaddeleri.tsx';
import { ProjeAyrinti } from './ProjeAyrinti.tsx';
import { ProjeGorevlerim } from './ProjeGorevlerim.tsx';
import { Projeler } from './Projeler.tsx';
import { StatuListesi } from './StatuListesi.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/projeler', ekran: Projeler },
  // Sabit yol, :id'den önce eşleşmeli.
  { yol: '/projeler/statuler', ekran: StatuListesi },
  { yol: '/proje-gorevlerim', ekran: ProjeGorevlerim },
  { yol: '/projeler/sablonlar', ekran: GorevSablonlari },
  { yol: '/projeler/hazirlik-maddeleri', ekran: HazirlikMaddeleri },
  { yol: '/projeler/hazirlik-kademe', ekran: HazirlikKademeAyari },
  { yol: '/projeler/:id', ekran: ProjeAyrinti },
];
