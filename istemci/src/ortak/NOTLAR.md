# İstemci ortak notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Alt yol üst sayfaya aittir ve yol biçimi dardır: görünürlük birebir dizgeye bakınca alt yol ve yazım varyantı yetkisiz açılıyordu.
- Vazgeçildi: kabuğun rota keşfi dosyasını doğrudan ithal etmesi. Keşif bütün modül ekranlarını, ekranlar da ortak arayüzü yükler; döngü oluşur. Saf yardımcı ayrı dosyadadır.
- Sunucu iletisi olan her hatada o gösterilir (kullanıcı kararı, 06.10.2026). Hata nesnesinin kendi iletisi ekrana basılmaz: ağ hatasında tarayıcının metnidir; ekran ileti seçiciye kendi iletisini verir.
- İstek kimliği kendiliğinden eklenmez (varsayım): bayraksız ucun başlığı ne yapacağı belli değil; yeniden deneme de yalnız sunucuda tekrar korumalı uçta güvenlidir, öbüründe çift kayıt yazar.
- Sonucu bilinmeyen hatadan (ağ, zaman aşımı, her 5xx) sonraki HER yeniden gönderim aynı kimlikle yapılır; kuyruk kimliği öğeyle birlikte saklar (öğe oluşurken üretilir). 5xx de belirsizdir: sunucu yazıyı kalıcı kıldıktan sonra bağlantısını yitirip hata dönmüş olabilir. Zayıf rastgelelikle kimlik yedeği bilerek yok.
- Yol ile cevap tipi modülün kendi uç haritasından (tip) okunur. Vazgeçildi: istemcide tek ortak eşleme dosyası (iki modül aynı dosyaya yazar); lint kuralı (tipi göremez, yalnız biçimi denetler).
- Test: koşucunun kendi bekleme yardımcısı güncellemeyi sarmaz, `act()` uyarısı üretir; bileşen kütüphanesininkini kullan.
- Test: tek alanlı şemadan alan silinince tip boş nesne olur ve fikstürdeki fazla alan derleyiciye takılmaz; tip kanıtı için alan adı ya da değer değiştir. Toplu tip komutu sunucuda kırılırsa istemciye hiç geçmez; istemci kanıtını ayrı koş.
- Tablo kart kipine içerik kabına sığmayınca geçer (ölçümle). Vazgeçildi: sabit eşikli kap sorgusu; dar tabloyu tablet dikeyde gereksiz karta çevirir, geniş tabloyu tablet yatayda yine taşırır.
- Kart kipinde içerik değişince yeniden ölçülmez, yalnız kap genişliği değişince: ölçüm için tablo kipine dönmek sayfayı kısaltıp kaydırma yerini oynatır. Süzünce kip bu yüzden yerinde kalır.
- Tarih gibi bölünmemesi gereken sütunu ortak parça tanıyamaz; modül sütuna `kirilmaz` yazar.
- Terminal parçalarının görünümü ve davranışı kullanıcının tasarladığı başvuru arayüzünden alındı (kullanıcı kararı, 07.10.2026). Alınmadı: sabit ekrana ölçekleme, çevrim halkası, hurda yayı, konfeti (ilk ikisi veri ister, hepsi satır içi stil ister). Büyük değişim eşiği ortak parçada değil, çağıran ekrandadır (iş kuralı).
- Kadranın yan göstergeleri ekran genişliğine değil bölmenin genişliğine bakar: üç sütunda orta bölme daralınca göstergeler yandaki sütunun üstüne çıkıyordu.
- Durum rengi metin olarak ayrı değişkenden okunur: açık temada ayar sarısı yazı olarak okunmuyor.
- Vazgeçildi: neden seçimi için ayrı karo parçası. Pencere + gruplu seçim + pencerenin alt düğmeleri yetiyor; başvurudaki "nedensiz kaydet" ve "önerilen neden" alınmadı (hurda nedensiz yazılmaz; öneri veri ister).
- Basılı tutulan düğmeden başlayan dokunuş sayfayı kaydırmaz (bilerek): kaydırma basışı iptal ediyordu.
- Ortak sete eklenen simge yöneticinin seçim listesine düşer ve o modülün ad tablosuna ad ister. Liste durumu kancası adres kapalıyken de yönlendirici ister.
- Açılır menünün yeri ölçülmez, tarayıcının çapalı konumlamasına bırakılır: ölçüm satır içi stil ister; bilmeyen tarayıcıda menü ekranın altına oturur. Vazgeçildi: düğmenin yanında mutlak konum (tablonun kaydırma kabı kesiyor).
- İkinci menünün kipi (sütun, şerit) stil sorgusundan değil kabuğun yazdığı öznitelikten gelir: eşik tek yerde durur, kip testle ölçülür.
- Vazgeçildi: ekranın menüyü kendi çocuklarıyla sardığı bileşen (dış teslimdeki ilk biçim). Modül çizmiş olur; yetki süzgeci ve sayaç her modülde yeniden yazılır. Tablet genişliğinde dar sütun da alınmadı: çerçeveli içeriğe 500 pikselden az yer kalıyordu.
- Şeritte etkin madde ilk çizimde görünür yere kaydırılsa da sayılar ve yazı tipi sonradan gelince dışarıda kalıyordu; yer o zaman yeniden bulunur.
- İkinci menü maddesinin işlemi yalnız görünürlüktür (varsayım): maddesi gizlenen yolun rotası kapanmaz, veri yetkisi sunucudadır. Sayaçta gerçek sıfır da gösterilmez (varsayım).
- `cizim/` Arkon ile Kalite Merkezi'nin ortak çizim stüdyosudur (616 b, 620 a). Modüle ait olan her şey `CizimOrtami` ile içeri verilir (önbellek, ölçü aletleri, cihaz ayarı, ses); ortak parça modül ithal etmez. İstisna: ağır kitaplıklar Arkon'un derlediği `/arkon-mes/vendor/` adresinden yüklenir (`kitaplik.ts`). `cekirdek/tol.ts` ve `stepdraw.ts` eski Arkon kodudur, eski Arkon da onları buradan okur; istemci tip programının ve lint'in dışındadır (660 a, UYUM-BORCU).
- Yalıtılmış çerçevede form izni yalnız `submit` olayını açar; gönderimin kendisi bileşenin koyduğu `form-action 'none'` ile her adrese kapalıdır. Politika belge türünün hemen ardına konur: sayfanın içinde geçen `<head>` ya da yorum yeri kaydıramasın diye. Ekran olayı `preventDefault` ile işleyip veriyi köprüyle yollamalıdır.
- Menü maddesinin ek işlemleri `islem`'in yerine değil yanına (`veya`) yazılır: `islem`'i doğrudan okuyan eski kod maddeyi fazla göstermez, az gösterir. Sade görünüm yetkisi yetmeyen kişiyi menüsüz bırakmaz, tam menü kalır.
- Modül ayar ekranı Sistem Ayarları'nda aynı bileşenle açılır; sayfa yetkisi değişmedi (kullanıcı kararı, kart #587). Adresten görünüm seçen çerçeveli ekran oraya gömülemez.
