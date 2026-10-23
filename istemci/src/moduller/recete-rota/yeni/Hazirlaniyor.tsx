import { DurumKutusu } from '../../../ortak/arayuz/index.ts';

// Parça yazarının dolduracağı bölümün yer tutucusu (iskelet). Sıfır ya da boş tablo göstermez: bölümün hazırlandığını söyler.
// Testler bu metne bağlı değildir; bölüm `data-parca` ve bölge adıyla bulunur.
export function Hazirlaniyor({ baslik, parca }: { baslik: string; parca: string }) {
  return (
    <div className="tc-rry-bolum" data-parca={parca}>
      <DurumKutusu durum="bos" mesaj={`${baslik}: bu bölüm yeni ekranda hazırlanıyor. Bugünkü ekran ikinci menüdedir.`} />
    </div>
  );
}
