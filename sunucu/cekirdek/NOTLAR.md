# Çekirdek notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Transaction kapanışı işleyici döner dönmez, bitiş komutundan önce olur; sonraya alınırsa araya giren
  sorgu bitişin ardına sıralanıp transaction dışında kalıcı olur. İptal durumundaki transaction'da
  bitiş komutu hata vermez; yalnız cevabın komut etiketi ele verir.
- Vazgeçildi: her sorgu sözüne ret işleyicisi takmak (beklenmemiş sorgunun hatasını gizlerdi).
- Vazgeçildi: okuma transaction'ını ilk sorguda açmak (beklenmemiş sorgu izlemesini iki katmanda yinelemek gerekiyordu). Görüntü açılışta değil ilk sorguda alınır.
- Sağlık uçları transaction dışında: asılı veritabanında yoklama süre sınırıyla döner ve geride sonuçlanmamış sorgu bırakır; içeride bu "beklenmemiş sorgu" kuralına takılırdı.
- Zaman: sürücü düzeyinde ayrıştırıcı eklenmedi (zamanı `Date` okuyan modül testi var; bütün modüllerin okuduğu değer değişirdi); tek yol SQL parçasıdır ve zaman yayan iki modülün bugünkü çıktısıyla aynıdır. Saat farkı oturumun saat dilimini izler: testte dilim transaction içinde `SET LOCAL` ile sabitlenir.
- Doğrulama iletisi: çağrıya verilen eşleme zincirde en son koşar; şemadaki elle yazılmış ileti, gelen hazır iletinin kitaplığın İngilizcesinden farklı olmasıyla tanınır. Genel eşleme (`setErrorMap`) kurulursa bu ayrım bozulur. Liste: var olan modüller kalıba taşınmadı (dışarıda yazılıyor).
- Kısıt ihlali yalnız istek sınırında çevrilir; veritabanı katmanında çevirmek göç hatasının tanısını ve kısıt adına bakan testleri kör ederdi. Hatanın ayrıntı ve bağlam alanları satır değeri taşır.
- Kısıt sarmalayıcısı: türe göre yedek yalnız başka modülün kısıtı içindir (kendi tablosunda ikinci tekil kısıt yanlış iletiyi alırdı). Vazgeçildi: sarmalayıcıda kayıt noktası (ihlalden sonra süren komut yok); yedeği eşlemede ayrılmış anahtarla vermek (tırnaklı kısıt adı her metin olabilir). Kayıt noktası ayrı yardımcıdır (kart #211): `Db` arayüzüne yöntem olarak eklenmedi (modüllerdeki ve testlerdeki elle kurulmuş `Db`'ler kırılırdı); transaction'ı nesne kimliğinden tanır, sarmalanmış `db` ile açılmaz. Vazgeçildi: her hatayı döndürüp seçimi çağırana bırakmak (yutulan süre aşımı ve kilitlenme kalıcı ret olurdu); nokta başına tekil ad (aynı adlı iç içe nokta en içtekini gösterir). Test: kilitlenme ve sıralama çakışması sunucuya kodla ürettirilir; iki bağlantıyla kurulunca kurbanı sunucu seçer.
- Vazgeçildi: süre ayarlarını sürücü parametresiyle vermek (sıfır gönderilmiyor, rol varsayılanı kalıyordu) ve sürücünün kendi sorgu süre sınırı (süre aşımını ayırt ettirmiyor).
- Denetim kipi (kart #212): gövdesiz özet maskelenmiş gövdeden alınır (kullanıcı kararı); `yok` hiçbir uçta kullanılmıyor, kullanımı ayrı karar ister. Uç özetinde ve denetim girdisinde kip yalnız tam değilse vardır: var olan karşılaştırmalar ve aracın düz nesneli fikstürleri aynen kalsın diye. Vazgeçildi: eşik üstü alanı kendiliğinden kısaltmak. Özet seçicisi (kart #231, kullanıcı kararı: durum geçişi gövdede olan uçta kim neye çevirdi okunsun): sınırı aşan ya da fırlatan seçici komutu düşürür (kırpılan değer yanlış kayıt, atlanan seçim denetimsiz yazma olurdu); seçicinin uygulama hatası da 500'dür (ret sayılsa yazı denetimsiz kalırdı) ve iletisi günlüğe geçmez; seçim bir kez okunup kopyalanır. KURAL: seçim 512 bayta kadar serbest metin taşıyabilir ve maske yalnız alan adına bakar; seçicili uç sabit listede `+secim` ile durur, seçici eklemek de kullanıcı kararıdır. Test: yinelenen metin veritabanında sıkışır, satır boyutu rastgele içerikle ölçülür.
- Sorgu ortasında kopan bağlantının hatası ulaşılamama diye işaretlenir (kart #485): sürücü kopmayı `error` olayıyla süren sorguyu reddetmeden önce bildirir, ayrı `end` dinleyicisi gerekmez. Sağlam bağlantıda sürücünün attığı hata işaretlenmez. `numeric` üstel gösterim üretmez. Yeni tip ayrıştırıcısı eklenince dizisi de eklenir (sürücüde ayrı kayıt).
- Test: `describe` içindeki `after` kancası hata verirse koşu yine çıkış 0 ile biter; silinemeyen şema sessizce artık kalır.
- Web çatısı aralık dışı durum kodunu kendisi 500 ile reddeder; yalnız cevap koduna bakan test aralık denetimi silinince de yeşil kalır.
- Test: kısa bağlantı sınırıyla gerçek sunucuya bağlanma (yükte saniyeler sürer). Göç danışma kilidi
  veritabanı çapındadır: test kurulumları onu bekler; süre bütçesini beklenen olay gözlenince başlat. Asılı sahte
  veritabanıyla mutasyona süre sınırı ver. Şema önek süzgecini tek harften fazla gevşetme: asıl şemaları siler.
- Test: göçü önceki göçlere kadar kurulmuş, veri konmuş şemada sına; kısıt kaldırılmadan yapılan
  değer dönüşümü yalnız dolu tabloda patlar.
- İki veritabanı kullanıcısı: yazma hakkı tabloyu en ağır kipte kilitlemeye yeter. Uygulama kullanıcısı
  geçici tablo açamaz; fikstür DDL'i sahip bağlantısıyla koşar.
- Kimlik denetimi: test veritabanında rol açılamaz; hakları devralmayan üye yalnız atılacak kümede ölçülür.
  Giriş noktası testi test veritabanının public şemasının boş olmasına yaslanır: oraya göç uygulanırsa
  sunucu dinlemeye geçer ve test süre sınırıyla düşer.
- Veri kapsamı: kısıtın kaynağı boş listeyi "kısıt yok" diye döner, kapsamda boş dizi "hiçbir yer"dir; çeviri tek yerdedir ve dışa açılmaz; kapsamın içeriği özel alandadır (açık alanda yayma sınırsız kapsam üretiyordu). Muafiyet kaynağın içindedir: çekirdek bayrağı bilmez, testi sahte kaynakla ölçer. Kök veritabanı nesnesi `tx` alanıyla ayırt edilir ve orada bellekleme yapılmaz; transaction dışı `Db` sarmalayıcısı istek ömründen uzun tutulmaz: kapsam belleği nesne ömrü kadardır. Var olan modül denetimi yardımcıya taşınmadı (modüller dışarıda yazılıyor).
- Örnek veri (kart #906): tek transaction ve "biri yüklü derse hiç yazma" bilerek seçildi; modül bazında atlamak, elle girilmiş veriye yarım örnek eklerdi. Vazgeçildi: sunucu açılışında ya da göçte yüklemek (canlıya sızabilirdi), örnek parolayı depoda tutmak.
