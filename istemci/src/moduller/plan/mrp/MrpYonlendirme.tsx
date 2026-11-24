import { Navigate } from 'react-router-dom';

// Malzeme ihtiyacı ayrı sayfa değildir: Malzeme ihtiyacı ve satın alma sayfasının Matris görünümüdür (3666). Eski adres ve ona giden bağlantılar oraya yönlenir.
export const MRP_YOLU = '/plan/mrp';
export const MALZEME_SAYFASI_ADRESI = '/plan/malzplan';

export function MrpYonlendirme() {
  return <Navigate to={MALZEME_SAYFASI_ADRESI} replace />;
}
