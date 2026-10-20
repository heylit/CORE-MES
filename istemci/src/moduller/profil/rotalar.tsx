import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Gelenler } from './Gelenler.tsx';
import { Profil } from './Profil.tsx';

// Menü sayfası değildir: hiçbir sayfaya ait olmayan yol oturumu olan herkese açıktır; veri yetkisi uçlardadır.
export const rotalar: ModulRotasi[] = [
  { yol: '/profil', ekran: Profil },
  { yol: '/profil/gelenler', ekran: Gelenler },
];
