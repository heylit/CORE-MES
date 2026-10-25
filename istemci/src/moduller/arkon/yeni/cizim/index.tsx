import type { ArkonEkranOzellikleri } from '../sayfalar.ts';
import { CizimStudyosu } from './CizimStudyosu.tsx';

export { MerkezRozeti, MerkezSecici, useMerkezUyarilari, type MerkezUyarisi } from './Merkez.tsx';
export { Model3B } from './Model3B.tsx';
export { TeknikResim, type ResimBelgesi, type ResimNotu, type TaniBilgisi, type TeknikResimKontrolu } from './TeknikResim.tsx';

// A5: Çizim stüdyosu (PDF ve 3B okuma, OCR, balonlar, Çizim Merkezi). TeknikResim, Model3B ve Merkez parçaları öteki parçalarca da kullanılır.
export function Cizim(_o: ArkonEkranOzellikleri) { return <CizimStudyosu />; }
