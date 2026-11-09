import { Navigate, useLocation, useParams } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { denemeAdresindenYeni, ESKI_DENEME_KOKU, SEKMELER } from './yeni/sekmeler.ts';
import { FinansYeni } from './yeni/FinansYeni.tsx';
import { FaturaEslemesi } from './fatura-esleme/FaturaEslemesi.tsx';
import { ESLEME_ROTASI } from './fatura-esleme/acik.ts';

// Deneme adresinde kalan yer imi ve bağlar aynı bölüme gider; sorgu (açık firma kartı, ayar sekmesi) korunur.
function DenemeAdresi() {
  const { bolum } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`${denemeAdresindenYeni(bolum)}${search}${hash}`} replace />;
}

// Menünün kökü ve her ikinci menü maddesi ekranı açar; ekran bölümü adresten okur (1418, 1392 a). Genel gider oranı da
// ekranın sekmesidir: kabuk şeridi bu adreslerde çizilmez, sekmeler ekrandadır. Ekran kalıcı rota değildir; maddeler arasında
// React aynı ekranı korur, veri sorgu önbelleğindedir.
export const rotalar: ModulRotasi[] = [
  ...SEKMELER.map((s) => ({ yol: s.yol, ekran: FinansYeni })),
  { yol: ESKI_DENEME_KOKU, ekran: DenemeAdresi },
  { yol: `${ESKI_DENEME_KOKU}/:bolum`, ekran: DenemeAdresi },
  // 2675 (2671 b): menüde madde yok; fatura ayrıntısındaki bağlantıyla açılır, sayfa yetkisi Finans'ınki.
  { yol: ESLEME_ROTASI, ekran: FaturaEslemesi },
];
