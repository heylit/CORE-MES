import { Navigate, useLocation } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';

// Eski Rota ekranlarının yerini Reçete ve Rota aldı (kullanıcı kararları 13.10 ve 17.10.2026, borç R11; 979 a): adresler yer imi ve kayıtlı
// bağlantı kırılmasın diye karşılığına yönlenir. Sayfa ve ikinci menü kayıtları (paylasilan/sayfalar/rota.ts) `sayfa.rota` işlemi için durur.
const yonlen = (hedef: string): ModulRotasi['ekran'] => () => <Navigate to={hedef} replace />;

// Emirler Reçete ve Rota'da açılır, salt okunur liste Üretim Emirleri sayfasındadır (kart #1185); eski adresler sorgusuyla birlikte oraya gider.
function EmirlerYonlendirme() {
  const { search } = useLocation();
  return <Navigate to={`/uretim-emirleri${search}`} replace />;
}

// Plan ekranı tektir (240 a, 627 a); çizelge ve matrisin sayfa tanımı işlemleri (sayfa.cizelge, sayfa.matris) rollerde durduğu için kalır.
// Operatör Üretim Terminali'ni kullanır; eski yer imi Reçete ve Rota'ya düşer (terminal yetkisi herkeste yok).
const YONLENDIRMELER: readonly [string, string][] = [
  ['/rota', '/recete-rota/schema'], ['/rota/:urunId', '/recete-rota/schema'], ['/rota/operator', '/recete-rota/schema'],
  ['/rota/operasyonlar', '/recete-rota/schema'], ['/rota/sablonlar', '/recete-rota/schema'],
  ['/rota/stok', '/recete-rota/stock'], ['/rota/malzemeler', '/recete-rota/items'], ['/rota/kaynaklar', '/recete-rota/res'],
  ['/rota/plan', '/recete-rota/plan'], ['/rota/plan-studyosu', '/recete-rota/studio'], ['/rota/kanban', '/recete-rota/kanban'],
  ['/cizelge', '/recete-rota/plan'], ['/matris', '/recete-rota/plan'],
];

export const rotalar: ModulRotasi[] = [
  { yol: '/rota/emirler', ekran: EmirlerYonlendirme },
  { yol: '/emirler', ekran: EmirlerYonlendirme },
  ...YONLENDIRMELER.map(([yol, hedef]) => ({ yol, ekran: yonlen(hedef) })),
];
