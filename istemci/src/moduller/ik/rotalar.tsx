import { lazy } from 'react';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { PdksDosyaAktar } from '../nizamiye/disari.ts';
import { IkCercevesi, IkIslemlerimCercevesi } from './IkCercevesi.tsx';

// Yeni ekran motoru ve parçalarıyla yalnız açılınca yüklenir (eski çerçevenin paketi gibi).
const IkYeniIk = lazy(async () => ({ default: (await import('./yeni/IkYeni.tsx')).IkYeniIk }));
const IkYeniIslemlerim = lazy(async () => ({ default: (await import('./yeni/IkYeni.tsx')).IkYeniIslemlerim }));

// Bir sayfanın bütün maddeleri aynı çerçeveye gider; görünümü adres belirler (paylasilan/sayfalar/ik.ts). İK İşlemlerim ayrı
// ekrandır: iki sayfa arasında geçişte çerçeve yeniden kurulur. PDKS aktarımı Nizamiye'nin ekranıdır, çerçevenin görünümü değil;
// sabit yol '/ik/:gorunum'dan önce eşleşir.
export const rotalar: ModulRotasi[] = [
  { yol: '/ik', ekran: IkCercevesi },
  { yol: '/ik/:gorunum', ekran: IkCercevesi },
  { yol: '/ik/pdks', ekran: PdksDosyaAktar },
  { yol: '/ik-islemlerim', ekran: IkIslemlerimCercevesi },
  { yol: '/ik-islemlerim/:gorunum', ekran: IkIslemlerimCercevesi },
  // TS geçişi (199 b): yeni ekran alıma kadar ikinci yolda, yalnız yöneticide (YeniEkranKapisi).
  { yol: '/ik/yeni', ekran: IkYeniIk },
  { yol: '/ik/yeni/:gorunum', ekran: IkYeniIk },
  { yol: '/ik/yeni/:gorunum/:kimlik', ekran: IkYeniIk },
  { yol: '/ik-islemlerim/yeni', ekran: IkYeniIslemlerim },
  { yol: '/ik-islemlerim/yeni/:gorunum', ekran: IkYeniIslemlerim },
  { yol: '/ik-islemlerim/yeni/:gorunum/:kimlik', ekran: IkYeniIslemlerim },
];
