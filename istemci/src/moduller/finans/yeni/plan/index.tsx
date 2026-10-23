import type { EkranOzellikleri } from '../sekmeler.ts';
import { Hazirlaniyor } from '../Hazirlaniyor.tsx';

// F2 bu klasörü doldurur: nakit planı (Monte Carlo yelpazesi), bütçe, vergi takvimi (envanter bölüm 2). İskelet: yer tutucu.
export function NakitPlani(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Nakit planı" parca="F2" />;
}
export function Butce(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Bütçe" parca="F2" />;
}
export function VergiTakvimi(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Vergi takvimi" parca="F2" />;
}
