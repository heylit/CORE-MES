import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Firmalar } from './Firmalar.tsx';

// Ana sayfa ve üç menü maddesi aynı liste ekranıdır; ikinci menüyü kabuk MUSTERI_TEDARIKCI_IKINCI_MENU verisinden çizer.
export const rotalar: ModulRotasi[] = [
  { yol: '/musteri-tedarikci', ekran: Firmalar },
  { yol: '/musteri-tedarikci/musteriler', ekran: Firmalar },
  { yol: '/musteri-tedarikci/tedarikciler', ekran: Firmalar },
  { yol: '/musteri-tedarikci/fason', ekran: Firmalar },
];
