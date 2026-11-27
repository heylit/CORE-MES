import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Durus } from './Durus.tsx';
import { Esleme } from './Esleme.tsx';
import { GecisHazirligi } from './GecisHazirligi.tsx';
import { Karsilastirma } from './Karsilastirma.tsx';
import { Oee } from './Oee.tsx';
import { Sayim } from './Sayim.tsx';
import { TezgahAyrintisi } from './TezgahAyrintisi.tsx';

// Bölümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/tezgah-baglantisi.ts).
export const rotalar: ModulRotasi[] = [
  { yol: '/tezgah-baglantisi', ekran: Karsilastirma },
  { yol: '/tezgah-baglantisi/ayrinti', ekran: TezgahAyrintisi },
  { yol: '/tezgah-baglantisi/esleme', ekran: Esleme },
  { yol: '/tezgah-baglantisi/sayim', ekran: Sayim },
  { yol: '/tezgah-baglantisi/durus', ekran: Durus },
  { yol: '/tezgah-baglantisi/oee', ekran: Oee },
  { yol: '/tezgah-baglantisi/gecis', ekran: GecisHazirligi },
];
