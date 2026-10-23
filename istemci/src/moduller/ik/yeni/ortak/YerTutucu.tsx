import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';

// Parçası henüz yazılmamış görünüm.
export const YER_TUTUCU_ILETISI = 'Bu görünüm hazırlanıyor';
export function YerTutucu() {
  return <DurumKutusu durum="bos" mesaj={YER_TUTUCU_ILETISI} />;
}
