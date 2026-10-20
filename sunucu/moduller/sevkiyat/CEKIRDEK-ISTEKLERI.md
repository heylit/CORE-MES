# CEKIRDEK-ISTEKLERI: sevkiyat

1. `TMIV2_HARITA_DIZINI`: çekirdek ayar okuyucusuna ve `.env.ornek`'e isteğe bağlı değişken olarak eklensin; kurulum belgesine harita paketi
   (harita.json, yol.json, arama.json; OpenStreetMap, ODbL, depoya girmez) yazılsın. Dizin yoksa modül açılır; saat, dağıtma ve onay kapalıdır.
2. KARŞILANDI: büyük okuma cevabı (`GET /sevkiyat/harita`, ~4,5 MB) çekirdekte gzip ile, uçta `onbellek: 'etag'` ile gider (etag seçeneği #1818, harita ucu #1827).
3. Çözücü istek içinde koşar (10 iş, 4 araç: 0,45-0,8 sn, teslim ölçümü). İş ya da kullanıcı sayısı artarsa iş parçacığı.
Girenler (bu dalda, ayrı commit): sayfa ve ikinci menü kaydı, işlem toplayıcı satırı, rol x işlem göçü (kullanıcı onayı 11 Ekim).
