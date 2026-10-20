# Uygula (kalite-merkezi)

1. Göç: `npm run goc` (yeni tablo `kalite_merkezi_belge`, dizi `kalite_merkezi_surum`, iz tetikleyicisi; var olan tabloya dokunmaz).
2. Rol yok: işlemler (`kalite-merkezi.oku`, `.yaz`, `.geri-yukle`) yalnız yöneticide; roller bağlamada ortak yetki matrisinden verilir.
3. Sayfa: ana menüde Kalite grubunda "Kalite Merkezi", 21 maddelik ikinci menü (`paylasilan/sayfalar/kalite-merkezi.ts`).
4. Yeni npm paketi yok; yazı tanıma kitaplıkları `istemci/src/moduller/kalite-merkezi/uygulama/` altında üretilmiş `.ts` dosyalarıdır.
