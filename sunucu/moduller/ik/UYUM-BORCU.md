# Uyum borcu (ik)

## SUNUCUDA ZORUNLU listesinden eksik ya da kısmi kalanlar
- Veri kapsamı (iş merkezi) v2'de uygulandı (IK-27). Okuma süzgeci SQL'de değil serviste (`kapsamdaMi`, bütün kayıtlar okunup
  süzülür): İK kayıtları birbirine bağlı (izin -> personel -> iş merkezi) ve ekran bütün listeyi bir kerede alır. Kayıt sayısı
  büyürse SQL süzgecine (`kapsamSuzgeci`) taşınmalı.
- KAPANDI (borç değerlendirmesi 19.10.2026, geçersiz: kalıcı bedel, `cekirdek/kapsam.ts` `kapsamdaMi` iş merkezi null ise kapsamda; `ik/kurallar.ts` `kayitIsMerkezi` dept ve ayarlar için null): Departman, ayarlar ve pozisyonsuz aday kapsamsızdır (çekirdek anlamı: iş merkezi olmayan kayıt herkesin kapsamında).
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): `kisiSecenekleri` var (`kisiler/disari.ts:30`), ik kullanıyor (`ik/servis.ts:145`). Kişi–personel eşleşmesi personel kartındaki "TMI kullanıcısı" alanıyla; seçim listesi `kisiler.kisiSecenekleri` isteğine bağlı
  (BASKA-MODUL-ISTEKLERI). Girmeden teslim derlenmez.
- Dışarıdan gelen html/svg: modül html ya da svg kabul etmez; uygulama kullanıcı metnini her yerde kaçışlayarak basar
  (kod incelemesi). KAPANDI (borç değerlendirmesi 17.10.2026, SZ-4): kaçışlama testli (`istemci/src/moduller/ik/uygulama.test.ts` "İK kullanıcı metni kaçışlama"). İçerik politikası betik yüklemeyi ve dış isteği kapatır.

## Ekran (K2: olduğu gibi)
- `istemci/src/moduller/ik/uygulama/paket.ts`: uygulamanın kendi bileşenleri, renkleri, ölçüleri, satır içi stilleri ve simgeleri
  (tasarım değişkeni dışı). Kendi tasarım belirteçleri çerçevenin içindedir; TMI tokens.css kullanılmaz. Açık/koyu tema TMI'den gelir.
- `uygulama/yazi.ts`: Instrument Sans (TMI yazı tipi değil); veri adresi olarak gömülü.
- Uygulamanın üst çubuğu (konum, Ara, Görünüm, Yardım) çerçevenin içinde kalır; TMI'nin sayfa başlığı çubuğu ayrıca üstte durur.
- 360/768/1280 genişlik: uygulamanın kendi duyarlı düzeni; dar ekranda TMI ikinci menüsü şeride döner, uygulamanınki gizlidir.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): tema iletisi `istemci/src/moduller/ik/IkCercevesi.tsx:51` `yon: 'tema'`. Tema değişince çerçeve yeniden kurulmaz; tema çerçeveye iletiyle gider, açık form korunur (borç 177).
- Ctrl K ortak palette (kart #137, karar 102 a): çerçevede basılan Ctrl K uygulamanın aramasına ulaşmadan kabuğa gider (`acilis.ts`, yakalama evresi; paket değişmedi). Paletin "Bu sayfa" grubunda "İK'da ara" komutu uygulamanın aramasını açar. Kalan: uygulama arama sonuçlarını ve düz Türkçe komutlarını dışa vermiyor (paket derlenmiş, `api`'de arama yok); ortak palete öneri olarak (kural 8) geçmesi için İK'nın sonraki tesliminde `api` arama işlevi istenir. O zamana kadar uygulamanın araması Ara düğmesi ve `/` ile yerinde; düğmedeki "Ara (Ctrl+K)" ipucu paket metnidir.

## Ekranda kalan kurallar (sunucu denetlemez)
- İzin günü sayımı sunucuda da var (GÜNCELLENDİ 23.10.2026, DOĞRULANDI `servis.ts` `izinIsGunuSay` ve `izinIsGunuDenetle`, `GET /ik/izin-gunu`; Soru 55 ve 74): iş günü kişinin Vardiya takviminden sayılır, takvim yoksa yalnız hafta sonu düşer. Ekranda kalanlar: yıllık izin bakiyesi ve hak ediş, çakışma uyarısı; tazminat ve fazla mesai hesaplayıcıları; maliyet planı;
  yapılacaklar listesi; akıllı arama; ilan metni ve uygunluk kontrolü; Excel aktarımında T.C. kimlik ve IBAN doğrulaması;
  yaka ve kademe önerisi; işe alım aşamaları ve puanlama; performans ortalaması; eğitim takibi. Zimmet 244 a ile İdari İşler'e geçti (#1943, #1963).
- Sunucu bu kayıtlarda yalnız zorunlu alanları (IK-4), bağlı kaydın varlığını, sürümü ve yetkiyi denetler.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): kesinleşme sunucu motoruyla (`ik/servis.ts` `motorKur`, `motor.payroll`). Bordro hesabı hem ekranda (tahmin) hem sunucuda (kesinleştirme) yapılır; kesinleşen sonuç sunucunundur.

## JSON sütunlar
KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): ik göçlerinde `jsonb` yok (`grep -c jsonb sunucu/gocler/*_ik_*.sql` hepsi 0). Yok (v2, kullanıcı kararı 08.10.2026). Değişiklik geçmişindeki alan değeri (`ik_kayit_gecmisi_alani.onceki`, `sonraki`) metin
sütunudur; liste ve nesne alanlarında değer JSON yazımıyla saklanır (geri alma için).

## Tam ayrıştırmanın bedeli
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): 08.10.2026 tam ayrıştırma kararının kalıcı bedeli, iş değil. Uygulamaya her yeni alan bir göç ister; sütunu olmayan alan 400 ile reddedilir (sema.ts + göç + sema.test.ts birlikte değişir).
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): aynı karar (08.10.2026), kalıcı bedel. Seçenek listeleri (izin türü, cinsiyet, eğitim, ...) CHECK kısıtındadır; uygulamada liste değişirse göç gerekir.
- KAPANDI (borç değerlendirmesi 19.10.2026, geçersiz: kalıcı bedel, `ik/eslesme.ts` `okumaDegeri` tutar ve sayıyı `Number` döner): Sayısal sütunlar uygulamaya sayı olarak döner (uygulamanın hesapları sayı ister); TMI'nin "numeric metin döner" kuralı bu
  modülün uçlarında uygulanmaz (`eslesme.ts okumaDegeri`).
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): `numeric(20,6)` `sunucu/gocler/20261012134600_ik_tablolar.sql` içinde. Bordro ara sonuçları `numeric(20,6)`; tutar girdileri ve özetleri `numeric(14,2)` (kuruşa yuvarlanır).
- KAPANDI (borç değerlendirmesi 19.10.2026, geçersiz: kalıcı bedel, `ik/servis.ts` `topluKaydet` kayıtları sırayla `yaz` ile yazar, `baglariDenetle` her kayıtta): Tek istekte birbirine bağlı kayıtlar (ör. aynı toplu yazmada hem yönetici hem ona bağlı personel) sırayla yazılır; henüz
  yazılmamış kayda bağ BAGIMLI_KAYIT döner. Excel aktarımı yönetici bağı yazmadığı için etkilenmez.

## Susturma ve dosya
- `sunucu/moduller/ik/motor/bicim.ts`, `sabitler.ts`, `motor.ts`: `// @ts-nocheck` (ekrandaki motorun JavaScript kopyası).
  Tipli yüz `motor/arayuz.ts`. Motor "bugün"ü kendisi okur (dönem durumu, güncel ücret); kural fonksiyonları saat okumaz.
  Kopyanın ekrandaki motordan ayrışmadığını `motor-esitlik.test.ts` ölçer: aynı girdide bordro, izin bakiyesi, dönemler ve
  netten brüt iki motorda aynı çıkmalı (borç 186). Paket ya da kopya tek başına değişirse test kırılır.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): paket dinamik ithalle yalnız sayfada yüklenir (`IkCercevesi.tsx:30` `import('./uygulama/paket.ts')`). Üretilmiş büyük dosyalar: `paket.ts` (yaklaşık 0,55 MB), `yazi.ts` (yaklaşık 0,13 MB). Yalnız İK sayfası açılınca yüklenir.

## Kapalı özellikler (TMI içinde)
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): yedek ve deneme verisi TMI'nin işi kararı; kapalı kalması borç değil. Örnek veri, yedekten geri yükleme, tümünü silme (yedek ve deneme verisi TMI'nin işidir). "Yedeği indir" (JSON dışa aktarım)
  açık. Uygulamanın kendi değişiklik günlüğü yazımı kapalı; günlüğü sunucu yazar.

## Araç uyarıları (teslim sınıflaması)
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): `istemci/src/moduller/ik/sayfa.ts:8` `connect-src 'none'`, `sayfa.test.ts:10` sınar. Dış adres: `motor/sabitler.ts` ve `uygulama/paket.ts` içinde ilan kanallarının adresleri (kariyer.net, linkedin.com vb.) vardır.
  Bunlar kullanıcının tıkladığı bağlantıdır, kod istek atmaz; çerçevenin içerik politikası `connect-src 'none'`. `sayfa.test.ts`
  içindeki adres sınama değeridir (localhost) ve içerik politikasının dış adres taşımadığını sınar.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): depo `tmi` bağdaştırıcısı (`istemci/src/moduller/ik/acilis.ts:42` `var depo`, `:123` `storage: depo`). Tarayıcı deposu: `paket.ts` uygulamanın localStorage bağdaştırıcısını içerir (bağımsız kurulum için); TMI'de kullanılmaz,
  depo `tmi` bağdaştırıcısıdır (acilis.ts). Uygulamanın tarayıcıda tuttuğu veri yok.

## Diğer
- KAPANDI (borç değerlendirmesi 19.10.2026, geçersiz: kalıcı bedel, `ik/servis.ts` `GECMIS_SINIRI = 1000`): Değişiklik günlüğü ekranda son 1000 satırı gösterir.
- KAPANDI (borç değerlendirmesi 19.10.2026, geçersiz: kalıcı bedel, `ik/sema.ts` `GOREV_ALANLARI` ve `AYAR_LISTE_ANAHTARLARI` gorevler, maliyetPlani): Yapılacaklar erteleme ve gizleme durumu, maliyet planı senaryosu ayarlar içinde saklanır ve `ik.ayar-yaz` ister.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): dört göz ayarı sistem ayarından (`ik/servis.ts:280` `sistemAyariOku(db, 'ik.dort-goz')`). Dört göz ayarı yalnız kadro talebi (pozisyon) onayında; izin kararında "kimse kendine karar veremez" her zaman geçerli.

## v3 (bağlamada kapanacak)
- Mesailerim ve bordro onayı derlenmiş paket yamasıyla geldi (NOTLAR.md); ik-modulu kaynağına taşınmalı.
- Mesailerim'de "Devamsızlık (gün)" ayrı gün sayar; aynı güne iki kayıt bir gündür (borç 195, puantaj yaması `DUZELTMELER`).
  Devam ekranındaki "Devamsızlık" rakamı da kişi başına ayrı gün sayar (borç V3-2, aynı yama); Geç kalma kayıt sayısıdır.
- Devamsızlık günü İK kaynağından gelmeli (borç V3-2): iki ekran şimdilik devam kayıtlarındaki tarihleri sayar; asıl gün
  İK'nın kendi kaynağından (puantaj ya da İK devamsızlık kaydı) okunmalı. Kullanıcı 17.10'da "şimdilik" diye onayladı.
- Yapılacaklar'daki onay hatırlatması son üç ayın kesinleşmiş bordrolarını kapsar (VARSAYIM; daha eskisi Bordro ekranında görünür).
- İtiraz yolu (onaylamayanın açıklama yazması) ilk sürümde yok (ON-PAKET-ik-v3 açık soru, öneri: yok).

## Oturtma, kart #740 (bağlamada kapanacak)
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): üç göç ana dalda (`sunucu/gocler/20261012144336_kisiler_ik_islemleri.sql`, `..144346_..bordro_gordum`, `..144356_..bakim_sevkiyat`; PR #1618). Rol x işlem göçleri (`kisiler_ik_islemleri`, `kisiler_ik_bordro_gordum`, `kisiler_ik_bakim_sevkiyat`) ana dalda (borç 198 kapandı);
  dağılımı `ik.test.ts` göçten okuyup sınar.
- `ik_resmi_tatil` ile vardiya takvimi, `ik_personel.sicil_no` ile `kisi.sicil_no`, `ik_devam` ile vardiya mesaisi aynı kavram (ORTAKLIK-ik.md).
- KAPANDI (borç değerlendirmesi 19.10.2026, yapılmış: `paylasilan/sayfalar/ik.ts` sayfa ve ikinci menü simgesi `users`): Ana menü simgesi: "İnsan Kaynakları" `flag` yerine `scan` (Projeler `flag`'i aldı; ana menü simgeleri tekil). Kişi grubu simgesi yok; uygun simge bağlamada.

## Puantaj, kart #1571 (bağlamada kapanacak)
- Fazla mesai önerisi vardiya planındaki aralıklara göre hesaplanır; Vardiya'nın plan aralıkları planlı fazla mesaiyi ve duruşu da
  içerebilir, bu yüzden planlı fazla mesai öneride eksik görünebilir. Öneri yalnız öneridir, aktarırken saat düzeltilir.
- Puantaj satırı değişiklik geçmişine (`ik_kayit_gecmisi`) yazılmaz; satırda yazan ve zaman var, çekirdek denetim kaydı ucu tutar. Testli: `puantaj.test.ts` "puantaj satırı İK değişiklik geçmişine yazılmaz".
- Gün başına tek giriş-çıkış (ilk giriş, son çıkış); ara çıkış gerekirse alt tablo eklenir (VARSAYIM).
- Matriste sürükleyerek hücre seçimi yok; toplu giriş tarih aralığı ve kişi listesiyle yapılır. Excel'e aktarma yok.
- Ekran paket yamasıdır (`uygulama/yama/ik_puantaj_ekran.js`); ik-modulu kaynağı gelirse oraya taşınmalı.
- Terminal ya da kart okuyucudan otomatik giriş-çıkış yok; saatler elle girilir.
- IK-73 ekranda: `ik.oku` olup `ik.ozel-veri-oku` olmayan kişide personel formu kan grubu ve engel durumunu boş gösterir (değer sunucuda korunur). Alanı formdan kaldırmak paket yaması ister. Bugün `ik.oku` yalnız insan_kaynaklari ve yöneticide, ikisi de özel veri yetkisini alır; etkisi yok.
- IK-73 dolaylı iz: bordro kaydındaki engelli indirimi tutarı (`ik_bordro.engelli_indirimi`) engel derecesini ele verir; bordroyu gören `ik.oku` sahibidir. Yetkisiz kişinin ekranındaki bordro önizlemesi engel durumunu bilmediği için indirimsiz hesaplar; kesinleşen bordroyu sunucu tam veriyle hesaplar.

