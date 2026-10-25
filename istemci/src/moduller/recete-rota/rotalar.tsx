import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ReceteRotaCercevesi } from './ReceteRotaCercevesi.tsx';
import { PLANLAMA_ANAHTARLARI } from './planlama-menusu.ts';
import { PLANLAMA_YENI_ROTALARI } from './planlama-yeni/yollar.ts';
import { ReceteRotaYeni } from './yeni/ReceteRotaYeni.tsx';
import { SEKMELER } from './yeni/sekmeler.ts';

// Reçete ve Rota maddeleri yeni ekranı açar (541, 527 1 a); eski çerçeve bir süre `/recete-rota/eski/<bölüm>` adresinde kalır ve kişi
// menüsündeki "Eski görünüm" ile açılır. Planlama sayfaları planlama çerçevesinde açılır (planlama-menusu.ts); çerçeve görünümü
// adresten alır (useYalitilmisGorunum).
export const rotalar: ModulRotasi[] = [
  ...SEKMELER.map((s) => ({ yol: s.yol, ekran: ReceteRotaYeni })),
  ...SEKMELER.map((s) => ({ yol: s.eskiYol, ekran: ReceteRotaCercevesi })),
  ...PLANLAMA_ANAHTARLARI.map((a) => ({ yol: `/recete-rota/${a}`, ekran: ReceteRotaCercevesi })),
  ...PLANLAMA_YENI_ROTALARI,
];
