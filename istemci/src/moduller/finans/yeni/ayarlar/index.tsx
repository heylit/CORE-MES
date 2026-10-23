import type { EkranOzellikleri } from '../sekmeler.ts';
import { Hazirlaniyor } from '../Hazirlaniyor.tsx';

// F4 bu klasörü doldurur (envanter bölüm 2). İskelet: yer tutucu.
export function Ayarlar(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Ayarlar" parca="F4" />;
}
