import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ReceteRotaCercevesi } from './ReceteRotaCercevesi.tsx';
import { PLANLAMA_ANAHTARLARI } from './planlama-menusu.ts';
import { ReceteRotaYeni } from './yeni/ReceteRotaYeni.tsx';

// Her ikinci menü maddesi aynı ekrana gider; görünümü çerçeve adresten alır (useYalitilmisGorunum). Kök yol ilk maddedir
// (Üretim emirleri): ana menü bağlantısı adresi değiştirmez. Planlama sayfaları planlama çerçevesinde açılır (planlama-menusu.ts).
const MADDE_YOLLARI = ['/recete-rota', '/recete-rota/stock', '/recete-rota/schema', '/recete-rota/ops', '/recete-rota/sureler',
  '/recete-rota/items', '/recete-rota/res', ...PLANLAMA_ANAHTARLARI.map((a) => `/recete-rota/${a}`)];

export const rotalar: ModulRotasi[] = [
  ...MADDE_YOLLARI.map((yol) => ({ yol, ekran: ReceteRotaCercevesi })),
  // Yeni ekran (TS geçişi): alıma kadar yalnız yöneticiye açılır, menüde yoktur; eski çerçeve yerinde durur.
  { yol: '/recete-rota/yeni', ekran: ReceteRotaYeni },
  { yol: '/recete-rota/yeni/:bolum', ekran: ReceteRotaYeni },
];
