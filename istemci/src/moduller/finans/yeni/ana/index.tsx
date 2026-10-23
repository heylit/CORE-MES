import type { EkranOzellikleri } from '../sekmeler.ts';
import { Hazirlaniyor } from '../Hazirlaniyor.tsx';

// F4 bu klasörü doldurur (envanter bölüm 2). İskelet: yer tutucu.
export function AnaSayfa(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Ana sayfa" parca="F4" />;
}
