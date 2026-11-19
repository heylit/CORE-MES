import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ToplantiSayfasi, ToplantimSayfasi } from './ToplantiAyrinti.tsx';
import { GecmisToplantilar, Toplantilarim, YaklasanToplantilar, YeniToplanti } from './Toplantilar.tsx';

// /toplantilar ve alt yolları sayfanın (toplantilar.oku); /profil/toplantilarim Profilim altıdır, her rol açar (3448-2 a, kişi kendi toplantısını görür).
export const rotalar: ModulRotasi[] = [
  { yol: '/toplantilar', ekran: YaklasanToplantilar },
  { yol: '/toplantilar/gecmis', ekran: GecmisToplantilar },
  { yol: '/toplantilar/yeni', ekran: YeniToplanti },
  { yol: '/toplantilar/:id', ekran: ToplantiSayfasi },
  { yol: '/profil/toplantilarim', ekran: Toplantilarim },
  { yol: '/profil/toplantilarim/:id', ekran: ToplantimSayfasi },
];
