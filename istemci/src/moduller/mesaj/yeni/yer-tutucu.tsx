import { DurumKutusu, Pencere } from '../../../ortak/arayuz/index.ts';

// Parçası henüz gelmemiş görünüm, form ve kartın derlenen yerine geçer; parça kendi dosyasını yeniden yazar.
export const HAZIRLANIYOR = 'Bu bölüm hazırlanıyor';

export function YerTutucu({ baslik }: { baslik: string }) {
  return <section className="tc-my-yer-tutucu" aria-label={baslik}><DurumKutusu durum="bos" mesaj={HAZIRLANIYOR} /></section>;
}

export function YerTutucuPencere({ baslik, kapat }: { baslik: string; kapat: () => void }) {
  return (
    <Pencere acik kapat={kapat} baslik={baslik} tur="yan">
      <DurumKutusu durum="bos" mesaj={HAZIRLANIYOR} />
    </Pencere>
  );
}
