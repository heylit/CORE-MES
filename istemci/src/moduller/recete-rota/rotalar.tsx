import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ReceteRotaCercevesi } from './ReceteRotaCercevesi.tsx';

// Her ikinci menü maddesi aynı çerçeveye gider; görünümü çerçeve adresten alır (useYalitilmisGorunum). Kök yol ilk maddedir
// (Üretim emirleri): ana menü bağlantısı adresi değiştirmez.
const MADDE_YOLLARI = ['/recete-rota', '/recete-rota/plan', '/recete-rota/studio', '/recete-rota/kanban',
  '/recete-rota/stock', '/recete-rota/schema', '/recete-rota/ops', '/recete-rota/sureler', '/recete-rota/items', '/recete-rota/res'] as const;

export const rotalar: ModulRotasi[] = MADDE_YOLLARI.map((yol) => ({ yol, ekran: ReceteRotaCercevesi }));
