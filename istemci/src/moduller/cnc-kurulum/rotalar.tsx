import { Navigate, useLocation } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { CncEslestirme, ESLESTIRME_YOLU } from './CncEslestirme.tsx';
import { CncKurulumCercevesi } from './CncKurulumCercevesi.tsx';
import { prototipYukle } from './prototip.ts';

// Eski aktarım adresi (yer imi, bağlantı) eşleştirme sayfasına düşer; seçili makine korunur.
function EskiAktarim() {
  const { search } = useLocation();
  return <Navigate to={`${ESLESTIRME_YOLU}${search}`} replace />;
}

// Kök yol prototiptir (kendi iç gezinmesini taşır). Makine eşleştirme Çizim Merkezi'nin bölümüdür (adresi onun altında, ikinci
// menüsünde); ekran modeli prototipin kütüphanesiyle ürettiği için bu modüldedir.
export const rotalar: ModulRotasi[] = [
  { yol: '/cnc-kurulum', ekran: CncKurulumCercevesi, kalici: true, onYukle: prototipYukle },
  { yol: '/cnc-kurulum/aktar', ekran: EskiAktarim },
  { yol: ESLESTIRME_YOLU, ekran: CncEslestirme },
];
