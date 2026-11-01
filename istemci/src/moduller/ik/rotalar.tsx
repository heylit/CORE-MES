import { Navigate, useLocation } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { PdksDosyaAktar } from '../nizamiye/disari.ts';
import { IkYeniIk, IkYeniIslemlerim } from './yeni/IkYeni.tsx';

// Deneme adresinde (`<kök>/yeni/...`) kalan yer imi aynı görünüme gider; sorgu ve işaret korunur.
export const denemeAdresininYenisi = (adres: string): string => adres.replace(/^\/(ik|ik-islemlerim)\/yeni(?=\/|$)/, '/$1');
function DenemeAdresi() {
  const { pathname, search, hash } = useLocation();
  return <Navigate replace to={{ pathname: denemeAdresininYenisi(pathname), search, hash }} />;
}

// Bir sayfanın bütün maddeleri aynı ekrana gider; görünümü adres belirler (paylasilan/sayfalar/ik.ts). İK İşlemlerim ayrı
// ekrandır. PDKS aktarımı Nizamiye'nin ekranıdır; sabit yollar '/ik/:gorunum'dan önce eşleşir.
export const rotalar: ModulRotasi[] = [
  { yol: '/ik', ekran: IkYeniIk },
  { yol: '/ik/pdks', ekran: PdksDosyaAktar },
  { yol: '/ik/yeni', ekran: DenemeAdresi },
  { yol: '/ik/yeni/:gorunum', ekran: DenemeAdresi },
  { yol: '/ik/yeni/:gorunum/:kimlik', ekran: DenemeAdresi },
  { yol: '/ik/:gorunum', ekran: IkYeniIk },
  { yol: '/ik/:gorunum/:kimlik', ekran: IkYeniIk },
  { yol: '/ik-islemlerim', ekran: IkYeniIslemlerim },
  { yol: '/ik-islemlerim/yeni', ekran: DenemeAdresi },
  { yol: '/ik-islemlerim/yeni/:gorunum', ekran: DenemeAdresi },
  { yol: '/ik-islemlerim/yeni/:gorunum/:kimlik', ekran: DenemeAdresi },
  { yol: '/ik-islemlerim/:gorunum', ekran: IkYeniIslemlerim },
  { yol: '/ik-islemlerim/:gorunum/:kimlik', ekran: IkYeniIslemlerim },
];
