# Uyum borcu (kalite-merkezi)

## Bağlamada kapanacak
- İlk parça kararı (325 a) ve kayıt geçmişi (326 a) ekranları paketi değiştirmeden enjekte betikle eklendi. İlk parça bölümü ayrı bir
  ikinci menü maddesi değil, Bugün görünümünün başındadır (menü tanımı bu işin dokunma alanı dışındaydı); ayrı madde istenirse menü
  tanımı ve görünüm adı çekirdek turunda eklenir. Geçmiş bölümünde alan adları uygulamanın ham anahtarlarıdır (tanim, durum), formdaki
  etiketler değil; etiket eşlemesi uygulamanın form tanımlarından Aşama 2'de.
- Sürüm denetimi #1323 ile geldi. Kalan: çakışmada uygulama kendi genel iletisini de gösterir ("Kayıt kaydedilemedi. Bağlantıyı
  kontrol edip...") ve formu açık tutar; doğru neden kabuğun bildiriminde yazar. Uygulamanın `guncelleme` alanı olmayan yazmaları
  (ayarlar, olgunluk) yalnız köprünün son gördüğü sürümle korunur: akış aralığındaki (birkaç saniye) çakışmayı yakalar, açık formu değil.
  Uygulamanın genel iletisi Aşama 2'de (koordinatör kararı 17.10.2026, kullanıcı kartı yok).
- Saklama ikinci adımı (kullanıcı kararı 12.10.2026): `dev`, `sup`, `parca`, `ncr`, `capa` sırayla tam ayrıştırılır ve ilgili modüle
  bağlanır (ORTAKLIK); kalan koleksiyonlar jsonb'de, sorgulanan alanlara üretilmiş sütun ve dizin.
- Ana menü ve ikinci menü: uygulamanın geniş ekrandaki sol menüsü gizli, ikinci menü kabukta. Kapandı (kullanıcı kararı 17.10.2026):
  dar ekranda uygulamanın alt şeridi de gizli (`sayfa.ts` `GOMULU_STIL`; 360, 768, 1280'de denendi), üst çubuğu kalır. VARSAYIM: şeridin
  "Yeni" düğmesi (hızlı kayıt listesi) dar ekranda kalktı; aynı kayıtlar ilgili sayfalardaki düğmelerle açılır, "Menü" ikinci menüdedir.
- Kapandı (kullanıcı kararı 17.10.2026): "Ayarlar ve yedek" penceresi kapanınca adres alttaki görünüme döner (`acilis.ts` `SON_BETIK`;
  kaydedilmemiş değişiklik sorusunda pencere açık kalır, adres değişmez). 360, 768, 1280'de denendi.

- AQL lot planı ve lot kararı (564 2 a, 4 a, 6 a, 26.10.2026): tablo sunucu `kurallar.ts`'de ve ekranın `yeni/aql.ts`'sinde iki kopyadır
  (istemci sunucuyu ithal edemez); eşitliği `aql.test.ts` korur. Ekranın lot formu numarayı hâlâ tarayıcıda (`siradakiNo`) verir, sunucu
  aynı sıradan alır; ikisi aynı anda yazarsa aynı numara çıkabilir (DÖF'teki gibi Sistem Ayarları kalıbı paylasilan ayar kaydı ister,
  ayrı iş). VARSAYIM: Arkon tek numune sayısı kullandığı için `n` örneklemeli sınıfların en büyüğüdür; %100 sınıf (varsayılan kritik) yalnız
  kendi özelliklerinde bütün partiye bakar. Stoğun serbest/red olması stoğun ve Arkon'un işidir (K2, K3).

## Sunucu kuralları
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): onay ucu, kilit ve onay geri alma uygulandı (`kalite-merkezi/uclar.ts:58` `/kalite-merkezi/formlar/:kimlik/onay-geri-al`). Onay alanları (kart #1583, kullanıcı kararı 16.10.2026 "Reddetsin"): form onayı (`frm` durum "Onaylandı", onaylayan, onay günü,
  onay notu), uygunsuzluk ve DÖF kapanışı (`ncr`, `capa` durum "Kapalı"a girip çıkması) ve tedarikçi onay durumu (`sup` onay) genel
  kayıt yazmasıyla değişmez (403, alan `onay`); köprü aynı kaydı `/onayla` ucuna gönderir. Onay ucu `kalite-merkezi.onayla` ve
  `kalite-merkezi.yaz` ister; formda onaylayan oturumdaki kişinin adı, onay günü tesisin bugünüdür. Onay ucu tam denetimdedir
  (onaylanan içerik deftere girer). `kalite-merkezi.onayla` hiçbir role verilmedi; Aşama 1'de yalnız yönetici.
  Onay penceresi onaylayan adını sormaz (kullanıcı kararı 17.10.2026, "Üçü de"; `sayfa.ts` `SADE_YERLER`). Onaylı form kilitlidir
  (kullanıcı kararı 16.10.2026, "Kilitle"): yazma, onay ucu ve silme reddedilir (409); değişiklik onay ucundan onay geri alınarak
  yapılır. Geri yükleme onay alanına ve kilide bakmaz (ayrı işlem ve tam denetim; yalnız yönetici); karar: kalsın, geri yükleme kurtarma
  aracıdır ve onaylı formu yedekteki hâliyle değiştirebilir (koordinatör kararı 17.10.2026, kullanıcı kartı yok); onaylı formda "Onayı geri al" düğmesi
  (kullanıcı kararı 17.10.2026, "Eklensin") yalnız `kalite-merkezi.onayla` olana görünür; `POST /kalite-merkezi/formlar/:kimlik/onay-geri-al`
  formu taslağa döndürür, onaylayan ve onay gününü kaldırır, geri alan (`onayGeriAlan`) ve saati (`onayGeriAlmaZamani`) sunucudan
  yazar; bu alanlar da genel yazmayla değişmez. Düğmenin penceresi uygulamanın penceresidir, düğmesi "Onayı geri al" yazar (17.10.2026). `emir` kopyasındaki durum onay sayılmadı.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): fotoğraf dosya deposunda ve küçültülür (`istemci/src/moduller/kalite-merkezi/fotograf.test.ts`). Gövde sınırı 1 MB (çekirdek): sınırı aşan kayıt 413 alır; uygulama "kaydedilemedi" der, kabuk nedeni bildirir. Fotoğraf ve belge
  kayıt gövdesine girmez: ortak dosya deposuna parça parça gider, kayıt yalnız dosya kimliğini taşır. Fotoğraf yüklenmeden önce
  küçültülür (en uzun kenar 1600 piksel, JPEG; uygulamanın kendi işlevi, kullanıcı isteği 17.10.2026 bununla karşılandı;
  `fotograf.test.ts`; tarayıcıda 36 MB'lık fotoğraf 0,7 MB kaydedildi).
- Kapandı (kullanıcı kararı 16.10.2026, "Gövdesiz"): kayıt yazma ve geri yükleme uçlarının denetim satırı gövdesizdir; kim, ne zaman, kayıt (koleksiyon ve kimlik), beklenen sürüm ve geri yüklemenin parça bilgisi kalır, içerik ve fotoğraf deftere girmez. Silme ve dosya bağı küçük gövdeleriyle tam denetimde.

## Susturma ve dosya
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): modülde `ts-nocheck`/`eslint-disable` yok (grep boş). Dosya içi susturma yok.

## Ölçü aletleri tek kaynak: Kalibrasyon (kart 329 a, kullanıcı onayı 20.10.2026)
Paket dosyası (`uygulama/paket.ts`) değişmedi; her şey köprü (`kopru.ts`) ve eklenen betikle (`acilis.ts` `OLCU_ALETI_BETIGI`) yapılır.
- VARSAYIM (geri alma ucuz, tek ifade): periyot gün/30 ay olarak taşınır, yuvarlanmaz; ekranda gün olarak gösterilir (`periyotGun`). Vade ve durum Kalibrasyon kuralındandır (`kalibrasyonDurumu`); K85/K88 kuralları ve testleri aynı kaldı.
- Cihaz geçmişi penceresinde sertifika eki bölümü (yazma yolu) gösterilmez; ekler Kalibrasyonda tutulmaz. Kalıcı yol: Kalibrasyona dosya eki (ayrı karar).


## Stüdyo sunucusu (K1; 595 1 b, 597 a, 600 a, 26.10.2026)
- Kapandı (603 a): resim alma ve kaldırma, kontrol planı ve numune planı uçları `kalite-merkezi.onayla` ile yazıldı (603a-ek).
- VARSAYIM (603a-ek, geri alma ucuz): kontrol planı resim başına bütün yazılır ve resmin sürümü planın sürümüdür; kaldırılan balon pasif kalır
  (ölçümleri durur), numarası yeni balona verilebilir. Kararsız numunede istenen balon kaldırılmaz. Numune kuralındaki balon numarası parçanın
  herhangi bir etkin resmindeki numaradır (resim ayrımı yok). Sınır değiştiren düzenleme eski ölçümün uygunluğunu yeniden hesaplamaz.
- KAPANDI (884, 27.10.2026, kullanıcı: "884 yok"): Arkon `plan`, `files`, `requests`, `results`, `logMeas` ve Kalite Merkezi `cizim` kayıtlarının yeni tablolara taşınması yapılmaz; taşınacak eski veri yok kabul edildi, taşıma göçü yazılmaz (595 3 c). Arkon henüz yeni tabloları okumuyor.
- VARSAYIM (geri alma ucuz): stüdyo yalnız PDF resim ile STEP, STL, IGES model alır (Arkon'un belge merkezinden aldığı türler).
- VARSAYIM (geri alma ucuz): onay bütün balonların son ölçüsü uygunken, sapma uygunsuz ölçü varken verilir (Arkon kalite istasyonunun düğme kuralı sunucuya alındı); sapmada gerekçe zorunlu değil.
- VARSAYIM (geri alma ucuz): numune kritik bayrağı istenen balonlardan türer; ölçüm balonun son ölçüsü geçerlidir, düzeltme yeni ölçümdür.
- VARSAYIM (geri alma ucuz): Kalite Merkezi ucundan girilen ölçümün kaynağı `kalite`; Arkon `operator` ya da `cmm` verir.

## Emir kapanışı maddeleri (K3; 1074 a-netleştirme, 28.10.2026)
- Bağlamada kapanacak: ölçüm maddesi numunesiz emirde parçayı emir başına `uretimEmriOzeti` ile okur; toplu okuma istendi (BASKA-MODUL-ISTEKLERI).
- VARSAYIM (geri alma ucuz): karar verilmiş numune (onay, ret, sapma) maddeyi tamamlar; ret ve uygunsuz ölçüm yalnız ayrıntıda görünür, sonucu hatalı parça ve NCR maddeleri taşır.
- VARSAYIM (geri alma ucuz): numunesi ve ölçümü olmayan emirde parçanın kuralı boş olmayan numune planı varsa eksik, yoksa gerekmez.
- VARSAYIM (geri alma ucuz): elle açılan NCR'nin `emir` alanındaki numara emre bağdır; açıksa maddeyi durdurur. Bağı olmayan eski hatalı parça NCR'si tanımındaki emir numarasıyla tanınır; açıksa madde bilinmiyor (null) olur, kapalıysa sayılmaz.
- VARSAYIM (geri alma ucuz): kaynak emir hatalı parçanın girildiği emirdir (kol emri değil).
- Bağlamada kapanacak (kart 1525, 1548): KF-19 kaydının tarayıcıdan basılan etiket kartı (önizleme, Yazdır) kalite kaydı olarak duruyor ve deftere yazılmıyor; ürün etiketi yalnız "Etiket Merkezi'nde bas" ile basılmalı. Kaldırılması 1548 kararına bağlıdır (öneri a ile ilerlendi: kart kalır).
- Bağlamada kapanacak (kart 1525): KF-19'daki durum sözlüğü (KABUL, ŞARTLI KABUL, KARANTİNA, RET) stok kalite durumundan (serbest, karar bekliyor, şartlı, red) ayrı; etiket stoktakini basar, formdaki seçim stoka yazılmaz. Formun stok durumunu değiştirmesi ayrı karar.
- Bağlamada kapanacak (kart 1525): "Etiket Merkezi'nde bas" stok okuması (`stok.oku` ya da sayfa) ister; yoksa hata iletisi verir. Seri no (lot olmayan) stokta çözülmez.

## Açık kalan parçalar (borç denetimi, kart 2049)

- Kayıt geçmişi ve kilit (258 a, 19.10.2026): geçmiş `kalite_merkezi_belge_gecmisi` tablosunda, ekranı yok (okuma ucu istenirse ayrı iş).
  Sunucu kapalı NCR'yi ve Kabul/Ret sonuçlu muayeneyi kilitler; uygulamanın "kalite mühendisi kilidi açar" yolu artık sunucuda 409 alır; ekran kapanmış NCR ve sonuçlanmış muayenede kilit açmayı göstermez, düzeltmenin yeni kayıtla yapılacağını söyler (`acilis.ts` `KILIT_BETIGI`).
  KAPANDI (bağlama B16, 23.10.2026): kapanmış DÖF ve kararı verilmiş lot kabul kaydı da sunucuda aynı kilittedir (`kurallar.ts` `kapanmisKayitMi`; ekranın `KILIT_BETIGI` karşılığı ikinci yamada); form onayı sunucuda ayrıca kilitli.
  Kalan: DÖF kapanış koşulları (8D adımı 8, etkinlik "Etkin", kök neden dolu) yalnız ekrandadır; sunucuya alınması ayrı madde.
- DÖF tek sahip (155 a, bağlama T4, 23.10.2026): denetim hazırlığının açtığı DÖF burada `capa` kaydıdır; numarası Sistem Ayarları'ndaki
  `kalite-merkezi.dof-no` kalıbından. Uygulamanın kendi DÖF formu numarayı hâlâ tarayıcıda (`nextNo`) verir: sunucu dolu numarayı atladığı için
  çakışmaz, ama iki numara kaynağı vardır; formun da sunucudan numara alması bağlamada ayrı iş. Bulguda termin ve sorumlu yoktur, boş metin yazılır.

## Bilgi (borç değil)

Kurgu, karar ve sınır kayıtları; kapanacak iş değildir (borç denetimi, kart 2049).

### Bağlamada kapanacak

- Rol x işlem: kalite rolü sayfayı görür, okur, yazar ve onaylar (`sayfa.kalite-merkezi`, `kalite-merkezi.oku`, `.yaz`, `.onayla`).
  Müdür görür, okur ve onaylar. Kaynak: `20261015180508` ve `20261019083500_kisiler_rol_matrisi_139` göçleri (139 a, 160 a, 186 a).
  `.geri-yukle` hiçbir role verilmedi, yalnız yönetici.
- Giriş TMI oturumudur (PIN kalktı, 2026-10-16). Uygulamanın rolleri (Muayeneci, Kalite mühendisi, Kalite yöneticisi) kendi
  kullanıcı kaydındadır ve yalnız çerçevede denetlenir; sunucu yalnız okuma, yazma, geri yükleme işlemini ve kullanıcı/ayar
  kaydının yöneticiden geldiğini denetler. Rolün ortak yetki matrisine bağlanması bağlamada. "Son giriş" sütunu artık dolmaz
  (giriş izi yazılmıyor). VARSAYIM: denetim defterine daha önce yazılmış kullanıcı kaydı gövdeleri PIN özetini taşıyabilir;
  defter yalnız eklenir ve denetim modülünündir, bu PR dokunmadı. Karar: kalsın (koordinatör kararı 17.10.2026, kullanıcı kartı yok); canlıdan önce PIN sıfırlanır (#1590),
  deftere dokunulmaz.
- Ölçü aleti geçerliliği (262 a, 19.10.2026): sunucu yalnız kalibrasyon modülüne bakar (cihaz kodu = alet numarası, KM-K88). Ekran cihaz
  durumunu hâlâ kendi `dev` kaydının son kalibrasyon tarihinden gösterir ve ölçüm cihazını kendi listesinden önerir; ikisi ayrıştığında
  ekranın "geçerli" dediği cihazla ölçüm sunucuda reddedilir. Ekranın durumu kalibrasyondan köprüyle alması bağlamada. Mevcut cihazlar
  kalibrasyona bir kez girilmelidir (kullanıcıya soruda söylendi).
  KAPANDI (bağlama B17, 23.10.2026): cihaz listesi 329 a'dan beri Kalibrasyondan gelir ve ekran durumu Kalibrasyon kuralıyla hesaplıyordu,
  ama günü tarayıcı saatinden alıyordu. Artık sunucu her cihaza Kalibrasyonun veritabanı gününe göre hesapladığı durumu, vadeyi ve kalan
  günü koyar (`kurallar.ts` `olcuAletiGovdesi`: `kalibrasyonDurumu`, `kalibrasyonVadesi`, `kalibrasyonKalanGun`); ekranın `devStatus`'u
  onu gösterir (`sayfa.ts` `CIHAZ_DURUMU_KURALLI`), ölçüm denetimi de aynı durumla karar verir. Eşi olmayan eski kayıtta alan yoktur, kural
  yerelde koşar ve "Kayıt yok" der. Kalan: liste 15 sn'de bir yoklanır; gün dönümünde durum en çok bir yoklama gecikir.
- Ortak kavramlar uygulamanın kendi kopyasında (ORTAKLIK): ölçüm cihazı (kalibrasyon), tedarikçi (finans firma), parça (malzemeler),
  iş emri (uretim-emirleri), kullanıcı (kisiler), belge (dosya), resim (cizim, #80), kalite ölçümü (#78, Arkon kalite ekranı).
- İş emri, sipariş ve parça bağlantısı (596; 592 B1 c, B2 a, B3 c; 594 a; 26.10.2026): iş emri ve siparişler sahiplerinden okunur, Kalite
  Merkezi eklemez, düzenlemez, CSV aktarmaz, arşivlemez. Liste açık kayıtlar ve Kalite Merkezi kayıtlarının bağlı olduğu kapanmışlardır.
  Kapanmış satın alma siparişi numarayla bulunamaz (açık satırlarda ve belge kimliğinde var). İş emrinin termini açık listede boş
  (`acikEmirler` taşımıyor); kapanmışta `teslim`. Müşteri siparişinde parça yalnız tek kalemli siparişte dolu. Lot, muayene ve NCR'deki
  metin alanları (parça no, iş emri no) yerinde kalır, sahibinden numarayla çözülür. Eski `emir` ve `parca` kayıtlarından eşleşmeyenler
  `/kalite-merkezi/eslesme-sayimi` ile sayılır; silme ayrı onaydır (B3 c). Kalan: açık iş emri sayısı büyürse liste sayfalanır.

### Sunucu kuralları

- Kayıt içeriği sunucuda büyük ölçüde yorumlanmaz (Arkon kalıbı): zorunlu alan, NCR/DÖF kuralları uygulamadadır. Sunucu yetkiyi, koleksiyon ve
  kimlik biçimini, gövdenin nesne olmasını, değişiklik izinin değişmezliğini ve onay alanlarını denetler. İçeriğe bakan istisnalar: ölçüm
  cihazının kalibrasyonu (KM-K85, KM-K88), kapanmış NCR ve sonuçlanmış muayene kilidi (KM-K89), NCR karantinası ve serbest bırakma
  (KM-K229, KM-K90), askıdaki tedarikçi okuması (KM-K87); kuralların testleri `KURAL-TEST.md`'de.
- Tekrar koruması yok (`tekrarKorumali` verilmedi): tekrarlanan kayıt yazması aynı beklenen sürümü taşıdığından 409 alır, kayıt bir kez
  yazılır (#1323, "beklenen sürüm, eşzamanlı" testi); dosya bağı kimlikle üzerine yazdığı için aynı sonucu verir.
- Geri yükleme parça parça ve parçalar arasında bölünmez değildir; yarıda kalırsa yazılan parçalar yeni, kalanlar eski hâlinde kalır
  (yedekte olmayan kayıtlar yalnız son parçada silinir, KD-041). Bölünmez geri yükleme geçici tablo ister (şema); Aşama 2'de (koordinatör kararı 17.10.2026, kullanıcı kartı yok). Eski dosya bağları
  silinmez (sahipsiz kalır, ortak deponun temizliği alır). Yedekteki değişiklik izi alınmaz.
- Sürüm sırası için yazanlar tabloyu kilitler: yazma tek sıradadır. 100 eşzamanlı yazma + akış okuması ölçüldü (19.10.2026, yerel PostgreSQL 16, havuz 10, kayıt başı 2 KB, üç koşu): hepsi geçti, sürümler tekil; toplam 754-796 ms, kişi başı p50 602-628 ms, p95 743-788 ms. Test: `kalite-merkezi.test.ts` "100 eşzamanlı yazma ve okuma" (süreyi tanı satırına yazar, eşik koymaz). Atölye sunucusunda ölçülmedi.
- NCR kapanışında serbest bırakma (KM-K90, koordinatör kararı 19.10.2026): partinin bugünkü redinde NCR'nin redde almadığı bir giriş
  varsa (ilk parça reddi gibi; Stok `partilerinRedGirisleri`) ya da başka açık NCR partiye uyuyorsa parti bütünüyle karantinada kalır,
  kapanış nedeni tek satırla bildirir. Yalnız NCR'nin miktarını geri döndürmek Stok'tan miktarlı serbest bırakma işlevi ister; ayrı
  sonraki iş. VARSAYIM: silinmiş NCR'nin defterdeki redi de bırakılmaz (parti kalır).

### Susturma ve dosya

- 326 a geçmiş ucu en çok 50 sürümün tam gövdesini döner; gömülü fotoğraf (`data:`) cevabı büyütebilir, istemci onları "(dosya)" diye gösterir. Sunucuda özetleme ya da bayt sınırı gerekirse ayrı karar.

### Ölçü aletleri tek kaynak: Kalibrasyon (kart 329 a, kullanıcı onayı 20.10.2026)

- Ölçüm cihazı listesi (`dev`) Kalibrasyondan salt okunur gelir (GET `/kalite-merkezi/olcu-aletleri`, 15 sn'de bir yoklanır). Ekleme, düzenleme, kalibrasyon kaydı ve silme kapalıdır; köprü `dev` yazma/silme isteklerini 403 ile reddeder, ekranda Kalibrasyon sayfasına giden düğme vardır.
- Eski `dev` kayıtları tabloda durur, SİLİNMEZ. Kodu Kalibrasyondaki bir aletle eşleşenin (büyük harf, kırpılmış) eski kimliği korunur, yani ölçüm cihazı bağları bozulmaz; eşleşmeyen eski kayıt ekranda gösterilmez. Yeni aletler `kal-<alet kimliği>` kimliğiyle gelir; K85/K88 denetimleri bu kimliği sunucuda çözer.
- Karşılığı olmayan alanlar (marka, seri, çözünürlük, sorumlu, laboratuvar, kabul) BOŞ gelir; sıfır ya da uydurma değer yok.
- Yoklama yenilemesi: liste değişince 4 sn'lik eşleme akışıyla ekrana yansır; en çok ~15 sn gecikme.

### Stüdyo sunucusu (K1; 595 1 b, 597 a, 600 a, 26.10.2026)

- Listeler sınırlı: açık numune 200, emir ölçümü 2000 satır (sayfalama yok).
