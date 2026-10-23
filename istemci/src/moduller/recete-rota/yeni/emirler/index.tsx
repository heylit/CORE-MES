import type { EkranOzellikleri } from '../sekmeler.ts';
import { Hazirlaniyor } from '../Hazirlaniyor.tsx';

// R3 parçası: Üretim emirleri (liste, ayrıntı, emir komutları) ve Stok (statülü stok, statü tanımları). Bileşen adları değişmez.
export function UretimEmirleri(_o: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Üretim emirleri" parca="R3" />;
}

export function Stok(_o: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Stok" parca="R3" />;
}
