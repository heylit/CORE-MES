# Başka modül istekleri: musteri-tedarikci

1. sevkiyat: firmaya bağlı noktanın koordinatını `musteri-tedarikci/disari.firmaKonumlari(db, [firmaId])`'dan okusun (teslim adresi ya da merkez). Göçün noktanın adıyla kopyaladığı teslim adresi başlangıçtır; noktanın kendi koordinatı firmasız noktalarda kalır.
2. finans: çerçevedeki "Firmalar" görünümü cari (bakiye, açık belge) görünümü olsun; kart düzenleme `/musteri-tedarikci` sayfasına bağlansın. Pasif/aktif ucu finansta kalır (FNS-60).
3. satın alma, finans, sevkiyat: belgeye fatura ya da teslim adresi bağlanacaksa `musteri_tedarikci_adres.id` kullanılsın; adres kopyalanmasın.
