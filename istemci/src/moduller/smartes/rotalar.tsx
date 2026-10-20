import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { BaglantiDurumu } from './BaglantiDurumu.tsx';
import { Eslemeler } from './Eslemeler.tsx';
import { Alarmlar, Duruslar, Giden, UretimSayilari } from './Listeler.tsx';

// Bölümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/smartes.ts); her bölüm kendi adresindedir.
export const rotalar: ModulRotasi[] = [
  { yol: '/smartes', ekran: BaglantiDurumu },
  { yol: '/smartes/eslemeler', ekran: Eslemeler },
  { yol: '/smartes/is-emri-durumlari', ekran: UretimSayilari },
  { yol: '/smartes/duruslar', ekran: Duruslar },
  { yol: '/smartes/alarmlar', ekran: Alarmlar },
  { yol: '/smartes/giden', ekran: Giden },
];
