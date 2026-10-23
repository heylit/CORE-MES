import { DurumKutusu } from '../../../ortak/arayuz/index.ts';

// Parça yazarının dolduracağı ekranın yer tutucusu (F0 iskeleti). Sıfır ya da boş tablo göstermez: bölümün hazırlandığını söyler.
export function Hazirlaniyor({ baslik, parca }: { baslik: string; parca: string }) {
  return (
    <div className="tc-fy-bolum" data-parca={parca}>
      <DurumKutusu durum="bos" mesaj={`${baslik}: bu bölüm yeni ekranda hazırlanıyor. Bugünkü ekran ikinci menüdedir.`} />
    </div>
  );
}
