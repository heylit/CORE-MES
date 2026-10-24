import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';

// Parçası henüz yazılmamış sayfanın yer tutucusu. Parça kendi index.tsx'inde bunu kendi ekranıyla değiştirir.
export function Hazirlaniyor() {
  return <DurumKutusu durum="bos" mesaj="Bu bölüm hazırlanıyor" />;
}
