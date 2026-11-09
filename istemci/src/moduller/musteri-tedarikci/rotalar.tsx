import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Degerlendirme } from './Degerlendirme.tsx';
import { Firmalar } from './Firmalar.tsx';

// Ana sayfa ve üç menü maddesi aynı liste ekranıdır, değerlendirme ayrı ekrandır; ikinci menüyü kabuk MUSTERI_TEDARIKCI_IKINCI_MENU verisinden çizer.
export const rotalar: ModulRotasi[] = [
  { yol: '/musteri-tedarikci', ekran: Firmalar },
  { yol: '/musteri-tedarikci/musteriler', ekran: Firmalar },
  { yol: '/musteri-tedarikci/tedarikciler', ekran: Firmalar },
  { yol: '/musteri-tedarikci/fason', ekran: Firmalar },
  // 2456-4 b: tedarikçi değerlendirme matrisi; firma ana kaydından ayrı sayfa.
  { yol: '/musteri-tedarikci/degerlendirme', ekran: Degerlendirme },
];
