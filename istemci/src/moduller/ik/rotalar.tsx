import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { PdksDosyaAktar } from '../nizamiye/disari.ts';
import { IkCercevesi, IkIslemlerimCercevesi } from './IkCercevesi.tsx';

// Bir sayfanın bütün maddeleri aynı çerçeveye gider; görünümü adres belirler (paylasilan/sayfalar/ik.ts). İK İşlemlerim ayrı
// ekrandır: iki sayfa arasında geçişte çerçeve yeniden kurulur. PDKS aktarımı Nizamiye'nin ekranıdır, çerçevenin görünümü değil;
// sabit yol '/ik/:gorunum'dan önce eşleşir.
export const rotalar: ModulRotasi[] = [
  { yol: '/ik', ekran: IkCercevesi },
  { yol: '/ik/:gorunum', ekran: IkCercevesi },
  { yol: '/ik/pdks', ekran: PdksDosyaAktar },
  { yol: '/ik-islemlerim', ekran: IkIslemlerimCercevesi },
  { yol: '/ik-islemlerim/:gorunum', ekran: IkIslemlerimCercevesi },
];
