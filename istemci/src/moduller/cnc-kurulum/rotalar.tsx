import { Navigate, useLocation } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { CncEslestirme, ESLESTIRME_YOLU } from './CncEslestirme.tsx';
import { CncYeni } from './yeni/CncYeni.tsx';
import { gorunumAdresi, KOK } from './yeni/gorunum.ts';

// Eski aktarım adresi (yer imi, bağlantı) eşleştirme sayfasına düşer; seçili makine korunur.
function EskiAktarim() {
  const { search } = useLocation();
  return <Navigate to={`${ESLESTIRME_YOLU}${search}`} replace />;
}

// Menünün kökü ve ekranın kökü Ana Sayfa'ya düşer; eski çerçeve adresinin yer imleri de böylece açılır.
function AnaSayfaya() {
  return <Navigate to={gorunumAdresi('home')} replace />;
}

// Makine eşleştirme Çizim Merkezi'nin bölümüdür (adresi onun altında, ikinci menüsünde); ekran modeli bu ekranın sahnesiyle
// ürettiği için bu modüldedir.
export const rotalar: ModulRotasi[] = [
  { yol: '/cnc-kurulum', ekran: AnaSayfaya },
  { yol: '/cnc-kurulum/aktar', ekran: EskiAktarim },
  { yol: ESLESTIRME_YOLU, ekran: CncEslestirme },
  { yol: KOK, ekran: AnaSayfaya },
  { yol: `${KOK}/:gorunum`, ekran: CncYeni, kalici: true },
];
