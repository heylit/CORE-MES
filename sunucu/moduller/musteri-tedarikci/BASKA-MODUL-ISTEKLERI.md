# Başka modül istekleri: musteri-tedarikci

1. sevkiyat: firmaya bağlı noktanın koordinatını `musteri-tedarikci/disari.firmaKonumlari(db, [firmaId])`'dan okusun (teslim adresi ya da merkez). Göçün noktanın adıyla kopyaladığı teslim adresi başlangıçtır; noktanın kendi koordinatı firmasız noktalarda kalır.
2. finans: çerçevedeki "Firmalar" görünümü cari (bakiye, açık belge) görünümü olsun; kart düzenleme `/musteri-tedarikci` sayfasına bağlansın. Pasif/aktif ucu finansta kalır (FNS-60).
3. satın alma, finans, sevkiyat: belgeye fatura ya da teslim adresi bağlanacaksa `musteri_tedarikci_adres.id` kullanılsın; adres kopyalanmasın.
4. kalite-merkezi (2456, karne PPM bileşeni): giriş kontrolü lot olayına adetli kalemlerde alınan ve hatalı adet eklensin (`karneOlayiYaz` lot olayına isteğe bağlı `adet`, `hataliAdet`; şema ve sütun bu modülde ayrı kartla açılır). PPM puan eşiği o kartta sorulur. O zamana kadar PPM bileşeni null, ağırlığı dağılır.
5. kisiler (2456-2 c): `musteri-tedarikci.karne-agirlik` yönetici dışı role verilemesin (`DEVREDILMEZ_ISLEMLER` ya da eşdeğeri). Bugün hiçbir role satırla verilmez; yönetici rol ekranından elle verebilir.
6. satin-alma (2456, teklife yanıt bileşeni; 2443 b): teklif isteğine yanıt (zamanında yanıt verdi mi) satın alma sunucusunda hesaplanıp `karneOlayiYaz` ile yeni "teklif" olayı olarak itilsin (ADR 0006: karne satın almayı ithal etmez). Olay türü bu modülde ayrı kartla eklenir. O zamana kadar teklif bileşeni null.
7. satin-alma (2407, 2151-2 a): Tedarikçiler sayfası puanı ve sınıfı `karneOzetleri`'nden okusun (2456-4 b: matris burada, satın alma yalnız okur); `KarneOzeti` alanları geriye uyumludur, yeni alanlar `bilesenler`, `hesapSurumu`, `kaliteDegerlendirmesi`, `teslim.tam`. "Değerlendirme ekle" hizmet puanı ucuna yazsın (2403 a).
