import type { EkranOzellikleri } from '../sekmeler.ts';
import { Hazirlaniyor } from '../Hazirlaniyor.tsx';

// F1 bu klasörü doldurur (envanter bölüm 2). İskelet: yer tutucu.
export function Kayitlar(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Kayıtlar" parca="F1" />;
}
