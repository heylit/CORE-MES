import { lazy } from 'react';

// Montaj sahnesi (3209 a): oynatıcı ve terminal izleyicisi ağırdır (three.js), ayrı pakette yalnız açılınca iner. Kat 2'de kalır: yalnız
// paylaşılan sözleşmenin tipini ve Belge Merkezi'nin model okuyucusunu kullanır; recete-rota ve arkon buradan alır.
export const MontajOynatici = lazy(() => import('./Sahne3B.tsx'));
export const MontajIzleyici = lazy(() => import('./Izleyici.tsx'));
export type { Kamera, SahneDenetimi } from './Sahne3B.tsx';
export type { IzlenecekAdim } from './Izleyici.tsx';
export { ADIM_BEKLEMESI_SN, YON_VEKTORU, donguSuresi, modelBicimiBul, parcaHali, parcaIlerleyisi, type ParcaHali, type ParcaKutusu, type Uc } from './oynatma.ts';
