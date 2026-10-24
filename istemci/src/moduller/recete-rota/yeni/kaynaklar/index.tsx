import type { EkranOzellikleri } from '../sekmeler.ts';
import { Hazirlaniyor } from '../Hazirlaniyor.tsx';

// R2 parçası: Süreler, Malzemeler (salt okunur katalog ve kayıttaki eski kalemler) ve Kaynaklar. Bileşen adları değişmez.
export function Sureler(_o: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Süreler" parca="R2" />;
}

export function Malzemeler(_o: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Malzemeler" parca="R2" />;
}

export function Kaynaklar(_o: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Kaynaklar" parca="R2" />;
}
