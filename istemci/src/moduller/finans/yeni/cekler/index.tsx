import type { EkranOzellikleri } from '../sekmeler.ts';
import { Hazirlaniyor } from '../Hazirlaniyor.tsx';

// F2 bu klasörü doldurur (envanter bölüm 2). İskelet: yer tutucu.
export function Cekler(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Çek ve senet" parca="F2" />;
}
