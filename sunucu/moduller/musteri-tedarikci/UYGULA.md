# Uygula: musteri-tedarikci

1. `npm run goc`: `20261013214000_musteri_tedarikci_firma` uygulanır. Önce sayım (PR gövdesindeki SELECT) alınır; göç de NOTICE ile yazar.
2. Rol satırı elle girilmez: göç `finans.firma-*` satırlarını taşır ve aynı rollere sayfayı verir.
3. Sunucu ve istemci yeniden başlatılır; ana menüde Tanımlar altında "Müşteriler ve Tedarikçiler" görünür.
4. Geri dönüş: göç tek transaction; hata olursa hiçbir şey değişmez. Uygulandıktan sonra geri almak için ayrı ters göç gerekir (yazılmadı).
