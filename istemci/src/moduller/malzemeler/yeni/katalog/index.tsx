import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';

// Yer tutucu: parça yazarı bu bileşeni doldurur (PARCA-SOZLESMESI.md). Adı ve imzası değişmez.
export function Katalog(_o: EkranOzellikleri) {
  return <DurumKutusu durum="bos" mesaj="Katalog bölümü hazırlanıyor" />;
}
