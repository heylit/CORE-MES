import type { EkranOzellikleri } from '../sekmeler.ts';
import { Hazirlaniyor } from '../Hazirlaniyor.tsx';

// F3 bu klasörü doldurur: durum ve öneriler, gelir tablosu, karar araçları, ay sonu, tahminler (envanter bölüm 2). İskelet: yer tutucu.
export function DurumVeOneriler(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Durum ve öneriler" parca="F3" />;
}
export function GelirTablosu(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Gelir tablosu" parca="F3" />;
}
export function KararAraclari(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Karar araçları" parca="F3" />;
}
export function AyKapanisi(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Ay sonu kapanışı" parca="F3" />;
}
export function Tahminler(_: EkranOzellikleri) {
  return <Hazirlaniyor baslik="Tahminler ve doğruluk" parca="F3" />;
}
