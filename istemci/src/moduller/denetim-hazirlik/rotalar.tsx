import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { DenetimHazirlikCercevesi } from './DenetimHazirlikCercevesi.tsx';
import { DenetimYeni } from './yeni/DenetimYeni.tsx';

// İkinci menünün tek maddesi kök yoldur; prototip kendi iç gezinmesini taşır.
// TS geçişi (199 b): yeni ekran ikinci yolda, alıma kadar yalnız yöneticide (YeniEkranKapisi).
export const rotalar: ModulRotasi[] = [
  { yol: '/denetim-hazirlik', ekran: DenetimHazirlikCercevesi },
  { yol: '/denetim-hazirlik/yeni', ekran: DenetimYeni },
  { yol: '/denetim-hazirlik/yeni/:gorunum', ekran: DenetimYeni },
];
