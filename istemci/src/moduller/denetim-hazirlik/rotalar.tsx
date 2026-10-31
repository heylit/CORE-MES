import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { DenetimYeni } from './yeni/DenetimYeni.tsx';

// Menünün kökü (`/denetim-hazirlik`) yönlenmeden Bugün'ü açar; görünümler `/denetim-hazirlik/yeni/<görünüm>` adresindedir, `/yeni`
// Bugün'e döner (1392 a). Üç yol aynı ekrandır: aralarında geçişte ekran yeniden yüklenmez.
export const rotalar: ModulRotasi[] = [
  { yol: '/denetim-hazirlik', ekran: DenetimYeni },
  { yol: '/denetim-hazirlik/yeni', ekran: DenetimYeni },
  { yol: '/denetim-hazirlik/yeni/:gorunum', ekran: DenetimYeni },
];
