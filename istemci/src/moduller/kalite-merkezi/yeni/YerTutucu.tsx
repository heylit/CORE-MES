import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';

// Parçası henüz gelmemiş görünüm; eski ekran kabule kadar yerindedir.
export function YerTutucu() {
  return <DurumKutusu durum="bos" mesaj="Bu görünüm hazırlanıyor; eski ekran kullanılabilir." />;
}
