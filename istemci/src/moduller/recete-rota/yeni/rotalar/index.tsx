import type { EkranOzellikleri } from '../sekmeler.ts';
import { Hazirlaniyor } from '../Hazirlaniyor.tsx';

// R1 parçası: Ürün ve rotalar (akış şeması, düzenleme paneli, revizyon çubuğu) ve Operasyonlar. Bileşen adları değişmez.
export function UrunVeRotalar(_o: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Ürün ve rotalar" parca="R1" />;
}

export function Operasyonlar(_o: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Operasyonlar" parca="R1" />;
}
