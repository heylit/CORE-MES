# Satın alma, bağlama tur 1 akış C: deneme adımları (PR #366)

Önkoşul: dal sunucuda, `npm run goc` geçti (göç kursuz döviz teklifi, firması olmayan tedarikçi ya da kartı olmayan katalog kalemi bulursa durur ve listeyi yazar).

1. Finans > Firmalar: tedarikçi türünde bir firma açın (il, telefon, e-posta girin).
2. Satın alma > Tedarikçiler: firmayı arayıp seçin. Kartta il, telefon, e-posta finanstaki gibi görünmeli.
3. Finans'ta firmayı pasif yapın; satın almada tedarikçi pasif görünmeli, yeni teklifte seçilememeli.
4. Finans > Kurlar: USD için bugünün kurunu girin. Satın alma üst kur çubuğu ve Ayarlar bu kuru salt okunur göstermeli; EUR "finansta kur yok" demeli.
5. Bir talebe USD teklifi girin, kur alanını boş bırakın: kayıttan sonra teklifte finansın o günkü kuru görünmeli.
6. Finans'ta USD kurunu değiştirin; aynı teklifin kuru değişmemeli.
7. EUR teklifi girin, kuru boş bırakın: "Finansta ... EUR kuru yok; teklife o günün kurunu girin" iletisi gelmeli. Kuru girip kaydedin; finansın kur listesinde EUR görünmemeli.
8. Kararı onaya gönderin: Onay bölümünde Onayla/Reddet görünmeli, Sipariş bölümünde yalnız "Sipariş, karar onaylandıktan sonra verilir." yazmalı.
9. Reddedin: Onay düğmeleri kalkmalı, "Karar reddedildi..." yazmalı. Yeniden gönderip onaylayın: sipariş formu açılmalı.
10. Siparişi verin. Stok > Mal kabul: sipariş satırına kalandan fazla miktar girin. Satın almada Teslim bölümünde "fazla teslim: ... +N birim" etiketi görünmeli.
11. Stokta mal kabulü düzeltin (miktarı azaltın): etiket kalkmalı ya da yeni fazlayı göstermeli.
12. Malzemeler ve Hizmetler: aktif bir malzeme kartı açın. Satın alma > Malzemeler > "Kataloğa ekle": kartı kod ya da adla arayıp seçin, kaydedin.
    Kod, ad, kategori ve birim karttaki gibi görünmeli; düzenlemede bu alanlar kilitli olmalı. Kataloğa bağlı kart aramada "zaten katalogda" demeli.
13. Malzemeler ve Hizmetler'de kartın adını değiştirin: satın alma kataloğunda yeni ad görünmeli.
14. Talep eden olarak yeni talep açın, katalogda olmayan bir kalem yazın: "katalogda yok; talep ilerler" ipucu ve "Malzemeler ve Hizmetler" bağlantısı (yeni sekme) görünmeli; talep kaydedilmeli.
15. Satın alma > Malzemeler: "eşleşmemiş 1 kalem" uyarısı; "Kataloğa bağla" yalnız katalogdaki kalemleri sunmalı, yeni kalem açmamalı.

Not: 10-11 için stok tarafının `teslimIsle` çağrısı da birleşmiş olmalı.
