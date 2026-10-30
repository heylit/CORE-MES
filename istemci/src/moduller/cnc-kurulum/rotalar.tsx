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

// Ekranın `/yeni` kökü Ana Sayfa'ya düşer.
function AnaSayfaya() {
  return <Navigate to={gorunumAdresi('home')} replace />;
}

// Makine eşleştirme Çizim Merkezi'nin bölümüdür (adresi onun altında, ikinci menüsünde); ekran modeli bu ekranın sahnesiyle
// ürettiği için bu modüldedir. Menünün kökü (`/cnc-kurulum`) yönlenmeden Ana Sayfa'yı açar, görünümler `/cnc-kurulum/yeni/<görünüm>`
// adresindedir. Ekran kalıcı rota değildir: kalıcı rota tek adres tutar, iki kalıcı rota iki ayrı ekran (iki 3B sahne) kurardı.
// Kök ile görünümler arasında React ekranı korur (aynı bileşen, aynı yer); başka sayfadan dönünce ekran kayıtlardan yeniden kurulur.
export const rotalar: ModulRotasi[] = [
  { yol: '/cnc-kurulum', ekran: CncYeni },
  { yol: '/cnc-kurulum/aktar', ekran: EskiAktarim },
  { yol: ESLESTIRME_YOLU, ekran: CncEslestirme },
  { yol: KOK, ekran: AnaSayfaya },
  { yol: `${KOK}/:gorunum`, ekran: CncYeni },
];
