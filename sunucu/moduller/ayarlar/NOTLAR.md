# ayarlar notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Kararlar (06.10.2026, #117): sayfa ve değiştirme işlemi hiçbir role verilmez, yalnız yönetici bayrağı görür;
  her değişiklik denetim kaydına düşer; ilk ayar malzeme kartlarında dört göz, varsayılanı açık.
- Okuma ucu da yazma işlemini ister: ayrı okuma işlemi açılmadı, çünkü listeyi görecek başka kimse yok.
  Başka modül değeri uçtan değil dışa açık okuma işlevinden alır; o işlev yetki sormaz.
- Bir değişiklik iki denetim kaydı bırakır: uç katmanının komut kaydı (gövdede yalnız yeni değer) ve bu
  modülün yazdığı değişiklik kaydı (eski ve yeni). Vazgeçildi: eski değeri uç katmanının kaydına taşımak;
  çekirdekte işleyiciden denetime veri yolu ve büyük olasılıkla yeni sütun gerekiyordu.
- Aynı değeri yazmak kabul edilir ama değişiklik sayılmaz: satır ve değişiklik kaydı yazılmaz. Uç katmanının
  komut kaydı yine düşer; onu bu modül durduramaz.
- Değişiklik kaydındaki eski değer o an geçerli olandır: satır yokken varsayılan yazılır, boş bırakılmaz.
  Tanımın varsayılanı sonradan değişse de kayıt o gün neyin geçerli olduğunu söyler.
- Varsayılana geri dönmek satırı silmez, varsayılanı satıra yazar: koddaki varsayılan değişince elle
  seçilmiş değer kendiliğinden değişmesin.
- Saklanan değer tanımın türüne uymuyorsa dış okuma (`sistemAyariOku`) hata verir, varsayılana dönmez; liste o ayarı
  `gecersiz: true`, değer null ile verir (KD-015), ötekiler gelir. Değiştirme komutu yine çalışır ve kayda ham eski
  değeri yazar. Tanımın türü değişecekse değer göçle taşınır.
- Tanımı kaldırılan ayarın satırı tabloda kalır ve yok sayılır; silmek ayrı göç ve kullanıcı kararıdır.
- Değiştirme eski değeri okumadan önce anahtar başına danışma kilidi alır (KD-016): aynı anda gelen ikinci komut
  bekler ve birincinin yazdığını eski değer olarak kaydeder. Satır kilidi (FOR UPDATE) yetmedi: hiç yazılmamış
  ayarda satır yoktur. Sürüm sütunu dolu tabloya göç isterdi; ikinci komut 409 almaz, üstüne yazar ve kayıtta görünür.
- Ad: dışa açık okuma `sistemAyariOku`; çekirdekte ortam ayarını okuyan aynı kökten adlı işlev var,
  karışmasın diye ayrı tutuldu.
- Test tuzağı: kişi silme reddini ölçmek için girişi olmayan personel açılır; girişi olan kişinin silinmesini
  önce oturum tablosu engeller ve ayar kısıtı hiç sınanmaz.
