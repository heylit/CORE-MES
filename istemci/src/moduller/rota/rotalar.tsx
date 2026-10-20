import { Navigate, useLocation } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { TUM_BOLUMLER } from './bolumler.ts';
import { KaynaklarEkrani } from './KaynaklarEkrani.tsx';
import { paletli } from './KomutPaleti.tsx';
import { MalzemelerEkrani } from './MalzemelerEkrani.tsx';
import { MerkezBolumu } from './BolumYeri.tsx';
import { PlanCizelgesiEkrani, PlanMatrisiEkrani } from './PlanSaltEkrani.tsx';
import { StokEkrani } from './StokEkrani.tsx';

// Operatör Üretim Terminali'ni kullanır; eski yer imi boş sayfa yerine Rota ana sayfasına düşer (terminal yetkisi herkeste yok).
const OperatorYonlendirme = () => <Navigate to="/rota" replace />;
// Emirler Reçete ve Rota'da açılır, salt okunur liste Üretim Emirleri sayfasındadır (kart #1185); eski adresler sorgusuyla birlikte oraya gider.
// Rota tanımı Reçete ve Rota'dadır (kullanıcı kararı 17.10.2026, borç R11): rota verisi ortak olduğu için eski tanım ekranları
// (ürün ve rotalar, rota revizyonları, rota şablonları) açılmaz, adresleri Reçete ve Rota'nın "Ürün ve rotalar" görünümüne gider.
const ROTA_TANIM_BOLUMLERI = new Set(['rotalar', 'operasyonlar', 'sablonlar']);
const ReceteRotayaYonlendirme = () => <Navigate to="/recete-rota/schema" replace />;
// Plan ekranı tektir (240 a): eski plan, stüdyo ve kanban ikinci bir sıra veriyordu; adresleri Reçete ve Rota'daki karşılığına gider.
const ESKI_PLAN_ADRESLERI: readonly [string, string][] = [['/rota/plan', '/recete-rota/plan'], ['/rota/plan-studyosu', '/recete-rota/studio'], ['/rota/kanban', '/recete-rota/kanban']];
function EmirlerYonlendirme() {
  const { search } = useLocation();
  return <Navigate to={`/uretim-emirleri${search}`} replace />;
}

const HAZIR: Record<string, ModulRotasi['ekran']> = { kaynaklar: KaynaklarEkrani, malzemeler: MalzemelerEkrani, stok: StokEkrani };

// Merkezin bütün bölümleri Rota sayfasının alt yollarıdır; Ürün ve rotalar sayfanın kendisidir.
export const rotalar: ModulRotasi[] = [
  { yol: '/rota', ekran: ReceteRotayaYonlendirme },
  { yol: '/rota/operator', ekran: OperatorYonlendirme },
  { yol: '/rota/emirler', ekran: EmirlerYonlendirme },
  { yol: '/emirler', ekran: EmirlerYonlendirme },
  { yol: '/rota/:urunId', ekran: ReceteRotayaYonlendirme },
  // Menüdeki plan sayfaları (sayfa.cizelge, sayfa.matris): canlı planın salt okunur görünümü.
  { yol: '/cizelge', ekran: PlanCizelgesiEkrani },
  { yol: '/matris', ekran: PlanMatrisiEkrani },
  ...ESKI_PLAN_ADRESLERI.map(([yol, hedef]) => ({ yol, ekran: () => <Navigate to={hedef} replace /> })),
  ...TUM_BOLUMLER.filter((b) => b.yol !== '/rota').map((b) => ({
    yol: b.yol, ekran: ROTA_TANIM_BOLUMLERI.has(b.anahtar) ? ReceteRotayaYonlendirme : paletli(HAZIR[b.anahtar] ?? MerkezBolumu),
  })),
];
