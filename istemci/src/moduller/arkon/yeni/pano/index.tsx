import type { ArkonEkranOzellikleri } from '../sayfalar.ts';
import { AnomaliSayfasi } from './AnomaliSayfasi.tsx';
import { PanoSayfasi } from './PanoSayfasi.tsx';
import { KuyrukSayfasi, PlanKuyruguSayfasi } from './PlanKuyrugu.tsx';

// A3: Pano, Plan Kuyruğu (planlı duruşlar dahil), Kuyruk (salt okunur Plan Kuyruğu) ve Üretim Anomalisi.
export function Pano(_o: ArkonEkranOzellikleri) { return <PanoSayfasi />; }
export function PlanKuyrugu(_o: ArkonEkranOzellikleri) { return <PlanKuyruguSayfasi />; }
export function Kuyruk(_o: ArkonEkranOzellikleri) { return <KuyrukSayfasi />; }
export function Anomali(_o: ArkonEkranOzellikleri) { return <AnomaliSayfasi />; }

// Öteki parçaların kullandığı bileşenler (PARCA-SOZLESMESI.md): A4 iş merkezi süzgecini ve sayfa çerçevesini kullanır.
export {
  Cip, IsMerkeziSuzgeci, IstasyonSecimi, SayfaCercevesi, Secmeli, csvIndir, dosyaIndir, gunlugeYaz, useSoyle, useYerelSecim, useYetkiDenetimi,
  type Soyle,
} from './ortak.tsx';
export { VardiyaTanimsiz } from './PanoSayfasi.tsx';
export { PlanCipi } from './PlanKuyrugu.tsx';
export { onayBekliyor, cagrilariTopla, oeeOrtami, csvMetni, csvDosyaAdi, yeniKimlik, GUNLER, type Cagri, type CsvHucresi, type Renk } from './kurallar.ts';
