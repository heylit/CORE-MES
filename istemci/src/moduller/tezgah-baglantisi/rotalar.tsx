import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Karsilastirma } from './Karsilastirma.tsx';
import { TezgahAyrintisi } from './TezgahAyrintisi.tsx';

// Bölümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/tezgah-baglantisi.ts).
export const rotalar: ModulRotasi[] = [
  { yol: '/tezgah-baglantisi', ekran: Karsilastirma },
  { yol: '/tezgah-baglantisi/ayrinti', ekran: TezgahAyrintisi },
];
