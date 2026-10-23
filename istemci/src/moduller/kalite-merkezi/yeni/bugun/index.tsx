import { YerTutucu } from '../YerTutucu.tsx';
import type { KmSayaci } from '../sekmeler.ts';

// Parça yazarı bu dosyayı kendi bileşeniyle değiştirir (PARCA-SOZLESMESI.md).
export function Bugun() {
  return <YerTutucu />;
}

export const BugunSayaci: KmSayaci = null;
