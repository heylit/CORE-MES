# durus-nedenleri notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Kararlar (06.10.2026, #73 toplu onay): bağ `id` ile, kod değişebilir; yalnız yönetici düzenler (rol satırı yok);
  bütün hurda kaliteyi düşürür (bayrak yok); "varsayılanlara dön" yok; silme yok, pasife alınır.
- Karar (06.10.2026, #96): hazır duruş nedenleri çağrısız gelir (ekip ve gecikme boş); eşleşmeyi yönetici
  ekrandan girer. Kodlar `D-01` / `H-01` biçiminde kalır.
- Planlı nedende gelen çağrı ekibi ve gecikme reddedilmez, sessizce silinir (DN-08 dönüştürmede silinir diyor;
  oluşturmada da aynı yol kullanıldı, ekran zaten alanları gizler). Veritabanı kısıtı arkada durur.
- Kod önerisi liste cevabında gelir (`onerilenKod`), pasifler dahil bütün kodlardan hesaplanır; ayrı uç yok.
- Simge: sunucu yalnız biçimi denetler (küçük harf, rakam, tire); hangi simgenin var olduğunu istemci
  seçim listesi sınırlar. Göçle gelen listede simge boştur (kartta verilmedi).
- Karar (06.10.2026, #96): simge seçimindeki Türkçe adlar kullanıcı onaylıdır; ad değişikliği yeniden onay ister.
- Sıra: yeni kayıt sona eklenir; sırayı değiştiren uç yok (kapsamda yoktu).
- DN-02 (plansız duruş kullanılabilirlik kaybıdır, planlı duruş planlı süreden düşülür) burada ölçülmez: bu modül
  yalnız kategoriyi saklar; madde hesabı yapan modülün testine ertelendi.
