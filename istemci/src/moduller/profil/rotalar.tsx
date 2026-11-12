import { Navigate } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { GeriBildirimKategorileri } from './GeriBildirimKategorileri.tsx';
import { GeriBildirimMerkezi } from './GeriBildirimMerkezi.tsx';
import { GeriBildirimOzeti } from './GeriBildirimOzeti.tsx';
import { MiniPanoSayfasi } from './MiniPanoSayfasi.tsx';
import { MINI_PANO_YOLU } from './mini-pano-penceresi.ts';
import { Profil } from './Profil.tsx';

function EskiGelenler() {
  return <Navigate to="/geri-bildirim" replace />;
}

// Profilim her rolün menü sayfasıdır (sayfa.profil, 2192-4 b); veri yetkisi uçlardadır, her hesap yalnız kendi profilini görür.
// Geri Bildirim Merkezi menü sayfasıdır (kart 2192); ikinci menüdeki her maddenin rotası vardır. Eski "gelenler" adresi oraya gider.
export const rotalar: ModulRotasi[] = [
  { yol: '/profil', ekran: Profil },
  { yol: '/profil/gelenler', ekran: EskiGelenler },
  // Mini pano penceresi (3093 a): Hesap menüsü açar; panoyu üstte açan sayfa budur.
  { yol: MINI_PANO_YOLU, ekran: MiniPanoSayfasi },
  { yol: '/geri-bildirim', ekran: GeriBildirimMerkezi },
  { yol: '/geri-bildirim/ozet', ekran: GeriBildirimOzeti },
  { yol: '/geri-bildirim/kategoriler', ekran: GeriBildirimKategorileri },
];
