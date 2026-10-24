import type { GorunumOzellikleri, Gorunumler } from '../sekmeler.ts';
import { OnayAyrintisi } from './OnayAyrintisi.tsx';
import { OnayKutusu } from './OnayKutusu.tsx';

// Onaylar parçası (P3). Görünüm: approvals; kimlikle gelince tek onayın sayfası açılır.
function Onaylar({ id }: GorunumOzellikleri) {
  return id ? <OnayAyrintisi id={id} /> : <OnayKutusu id={null} />;
}

export const gorunumler: Gorunumler = { approvals: Onaylar };
