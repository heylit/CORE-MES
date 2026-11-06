import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Arsiv, Gelenler, HazirlaSayfasi, Tercihler, YayinlarSayfasi } from './Bildirimler.tsx';

// Menü sayfası değildir (222 a, yeni sayfa işlemi yok): hiçbir sayfaya ait olmayan yol oturumu olan herkese açıktır; zil ve
// Profilim buraya bağlanır, veri yetkisi uçlardadır (yalnız kişinin kendi satırları).
export const rotalar: ModulRotasi[] = [
  { yol: '/profil/bildirimler', ekran: Gelenler },
  { yol: '/profil/bildirimler/arsiv', ekran: Arsiv },
  { yol: '/profil/bildirimler/tercihler', ekran: Tercihler },
  { yol: '/profil/bildirimler/hazirla', ekran: HazirlaSayfasi },
  { yol: '/profil/bildirimler/yayinlar', ekran: YayinlarSayfasi },
];
