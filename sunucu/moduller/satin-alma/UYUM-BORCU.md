# UYUM BORCU: satin-alma (kart #162, Aşama 1: teslim olduğu gibi toplandı)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI (kod ya da komut), VARSAYIM, BİLMİYORUM.
Aşama 1'de bulgular düzeltilmez; "Bağlamada kapanacak" başlığındakiler bağlama aşamasında (Aşama 2) kapanır.
Aşama 1, 1. tur (kart #162, dal `162-satin-alma-uyum`, kullanıcı kararları S1-S3, 07.10.2026): kapanan maddeler "KAPANDI", değişenler "GÜNCELLENDİ" diye işaretli.

## Bağlamada kapanacak

1. KAPANDI (bağlama tur 1, SA1 a): göç `20261009021000_satin_alma_tedarikci_firma.sql` önce firması finansta olmayan tedarikçiyi sayar, varsa durur; yoksa `satin_alma_tedarikci.firma_id` -> `finans_firma(id)` yabancı anahtarı gelir (test `bagla-goc.test.ts`).
   Eski metin: Firma bağı boş (kırmızı çizgi değil, bağımlılık boşluğu). Firma kaydı dışarıda yazılan finans modülünde (kart #246, `finans_firma.id`).
   DOĞRULANDI: `satin_alma_tedarikci.firma_id` düz `int` (birincil anahtar), yabancı anahtar yok. `firma_id` kullanan dört tablo `satin_alma_tedarikci`'ye bağlı kalır.
   Uyum: finans gelince ayrı göçle `satin_alma_tedarikci.firma_id` -> `finans_firma.id` yabancı anahtarı (var olan satırlar önce doğrulanır).
2. KAPANDI (bağlama tur 1, SA1 a): `firma-gecici.ts` silindi; servis `../finans/disari.ts` ithal eder, testler finansın gerçek firmasıyla (`POST /api/finans/firmalar/ekle`) kurulur.
   Eski metin: geçici karşılık `firma-gecici.ts` finansın dört adını taşır (`firmaAdlari`, `firmaVarMi`, `firmaAra`, `firmaOzetleri`; imza VARSAYIM,
   BASKA-MODUL-ISTEKLERI.md). Finans yokken firma yoktur: `firmaVarMi` false, `firmaAra` boş, `firmaOzetleri` boş harita. SAT-41 artık uygulanır (önceden her firma
   aktif sayılıyordu; yetki açığı KAPANDI). Sonuç: finans gelene kadar yeni tedarikçi EKLENEMEZ (kullanıcı kararı S1: firma finansta açılır, burada seçilir).
   Servis firmaya yalnız `firmaKaynagi` nesnesiyle ulaşır; test bu nesneye uydurma firmalar koyar. Uyum: dosya silinir, ithal `../finans/disari.ts` olur,
   testler finansın gerçek firmasıyla kurulur.
3. KAPANDI: (bağlama tur 1: uydurma firmalar da kalktı, testler finans firmasıyla) SAT-41 ve SAT-42 testleri açıldı ve ikiye bölündü; SAT-53 SAT-65 testinde firma adı ve şehri yeniden denetlenir (uydurma firmalarla).
   Kalan: test firmaları finans yerine `firmaKaynagi`'na konur (madde 2 ile kapanır). 2. tur: firma verisini bu uydurma kayıtlardan ölçen beş test
   adında "[uydurma firma]" taşır (SAT-53/65, SAT-37/38/65, iki SAT-41, toplu firma özeti); testler atlanmaz. Finans gelince bu beşi finansın
   gerçek firmasıyla kurulur ve işaret kalkar.
4. KAPANDI: ekran `/firmalar/*` uçlarını çağırmaz. Tedarikçi formunda firma finanstan aranıp seçilir (`GET /satin-alma-firma-secenekleri`),
   firma alanları salt okunur. Teklif girişindeki "yeni tedarikçi" artık "kayıtsız tedarikçi (adla)"dır: teklif `firma_id` boş, adıyla kaydedilir.
   KAPANDI (borç değerlendirmesi 17.10.2026): boş durum metni düzeltildi (`merkez/memory.ts`). Eski kalan: tedarikçi listesinin boş durum metni "Teklif formundan da yeni tedarikçi ekleyebilirsiniz" der; artık doğru değil (prototip metni, dokunulmadı).
5. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): yabancı anahtar geldi, göç `20261009024000_satin_alma_katalog_malzeme_bagi.sql` "FOREIGN KEY (malzeme_no) REFERENCES malzeme_katalog_karti (no)".
   Eski metin: `satin_alma_katalog.malzeme_id` yabancı anahtarı kaldırıldı. DOĞRULANDI: teslim `REFERENCES malzeme` diyordu; `malzeme` tablosu depoda `20261007154341_malzemeler_eski_kart_kaldir.sql` ile
   düşürüldü (yeni kimlik `malzeme_katalog_karti.no`). Sütun düz `bigint`, bugün kullanılmıyor (`sorgular.ts` yalnız okur). Uyum: katalog senkronu kararlaştırılınca hedef (`malzeme_katalog_karti.no`) ve bağ ayrı göçle.
   GÜNCELLENDİ (tur 4, kullanıcı kararı SA4): sütun `malzeme_no integer` oldu (göç `20261008133000`), yabancı anahtarsız. Teslim `REFERENCES malzeme_katalog_karti (no)`
   diyordu; anahtar Aşama 2'de ayrı göçle gelir. Teslimin "olmayan numara reddedilir" testi sütun türü denetimine çevrildi; anahtar gelince geri döner.
6. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): rol satırları göç `20261009065000_kisiler_satin_alma_islemleri.sql` ile girdi (satin_alma, mudur, muhasebe_finans; talep-ac beş rolde); firma satırları #1164 ile musteri-tedarikci'de.
   Eski metin: Rol x işlem satırları yok: işlemler yalnız bayraklı yöneticide (rol göçü yazılmadı). DOĞRULANDI: `satin-alma.oku/yaz/talep-ac/onayla/teslim-al/ayar` ve dört sayfa işlemi
   `paylasilan/islemler/satin-alma.ts` ve `sayfalar/satin-alma.ts`'te (kart #254 ile girdi). Teslimin önerdiği matris (`CEKIRDEK-ISTEKLERI.md` Ç3) onay bekler; girince
   `oturum.test.ts` ve `kisiler/goc.test.ts` matris beklentileri güncellenir. Denetimde bulunan yetki açıkları kapanmadan role işlem verilmez.
   GÜNCELLENDİ (tur 4): `satin-alma.teslim-al` kalktı (teslim alma stokta). Teslimin yeni matrisi (Ç3: satin_alma, mudur, muhasebe_finans; depoda işlem yok)
   `firmalar.yaz` ve `sayfa.firmalar` içerir; ayrı firmalar modülü yok (sabit kimlik), o satırlar finansa göre yeniden sorulur.
7. `GET /satin-alma-acilis` `yetki: 'oturum'` (kayıtlı işlem değil); işlemsiz kullanıcıyı servis 403'e çevirir (test SAT-65). Uç yetki katmanında kayıtlı işlem ister kuralının istisnası. Uyum: `satin-alma.oku` ya da yeni işlem; talep eden akışı ayrı uç gerektirir.
   Aynı şekilde `POST /satin-alma-talepleri/:id/kaydet` en zayıf işlemi (`talep-ac`) ister, gerçek yetkiyi servis `degisiklikTuru` ile seçer (V-33); `/satin-alma-katalogu/kaydet` yazmada `talep-ac` ister, düzenleme yetkisini servis denetler.
8. Sürüm ve 409: `surumluGuncelle` talep, tedarikçi, katalog, ayar kayıtlarında kullanılır (DOĞRULANDI `servis.ts`). Açık nokta: alt kayıtlar (teklif, onay, hareket, senaryo) kendi sürümünü taşımaz, talebin sürümüyle bütün olarak yazılır; alt kayıt kimlikleri
   istemcide üretilen uuid'dir (V-39, sayı kimlik kalıbından sapma). Uyum: karar bekler.
9. KAPANDI: `talepleri/ac`, `katalogu/kaydet`, `siparisleri/teslim-al` tekrar korumalı; ekran `tekrarKorumaliGonder` ile gönderir.
   Not (DOĞRULANDI, koddan): önceden de çift yazma yoktu (istemci uuid'i ve teslimin durumu yinelemeyi reddeder); kapanan, cevabı yitirilen başarılı komutun yeniden denemede hata göstermesidir.
   GÜNCELLENDİ (tur 4): `siparisleri/teslim-al` kalktı; tekrar koruması `talepleri/ac` ve `katalogu/kaydet`'te kalır.
10. Liste uçları sayfasız (#169): `GET /satin-alma-acilis` bütün talepleri, kataloğu ve tedarikçileri tek cevapta döner; `sayfaliListe` yok. Uyum: açılış uzun vadede ayrı sayfalı listelere bölünür; ekran bütün veriyi bellekte tuttuğu için ekrana dokunur.
11. KAPANDI (borç turu 17.10.2026): `bagliyken` ve talep açmadaki tekillik yakalaması çekirdek `kisitKorumali` ile (türe göre yedek ileti); SAT-42 modülün iletisini de denetler.
    Eski metin: Kısıt iletisi (#168): `servis.ts` `bagliyken` kendi `try/catch` + `kisitIhlali` sarmalayıcısıdır, çekirdek `kisitKorumali` kullanılmıyor.
12. Veri kapsamı (#91): talep `birim` taşır, iş merkezi (`istasyon`) taşımaz; `kapsam.ts` kullanılmıyor. VARSAYIM: iş merkezi kısıtı satın almaya uygulanmaz; kullanıcı kararı gerekir.
13. KAPANDI (kullanıcı kararı S2 ve SF, 08.10.2026; çekirdek `denetimEki`, #290): `POST /satin-alma-talepleri/ac` ve `/:id/kaydet` gövdesiz denetlenir;
    fiyatı ya da para birimi değişen her teklif ve kalem bir ek satırıdır (teklif, firma kimliği, kalem, miktar, para birimi, önceki ve yeni fiyat; kayıtsız
    tedarikçide firma boş). Serbest metin ve dosya girmez. 100 satırı aşan kayıtta ilk satır `{ kesildi, toplam, yazilan: 99 }`. Durum ve karar ek satıra girmez.
    `_ek` yalnız `denetim.govde-oku` ile görünür.
14. Logo alanları (kart #205). Kapandı: sipariş numarası `satin_alma_siparis.no` benzersiz (`satin_alma_siparis_no_tek`, göç `20261011174500_satin_alma_siparis_no.sql`)
    ve en çok 16 karakter (`satin_alma_siparis_no_bicim`, göç `20261012145457_satin_alma_numara_kurallari.sql`); sipariş ve talep Logo kayıt numarası
    (`20261012111100_satin_alma_logo_siparis.sql`, `20261012124100_satin_alma_logo_talep.sql`); ödeme planı finansta (`finans_siparis_odemesi`). DOĞRULANDI (göç dosyaları).
    Kalan: proje, masraf merkezi ve ambar kodu alanları yok (logo UYUM-BORCU 14 ile aynı karar; Logo gönderimi kapalıyken dondurmada bekler).
15. Ekran: prototip düz TypeScript ve DOM (React değil), `innerHTML` ile çizer, kendi bileşenleri/menüsü var; ortak arayüz (`Kart`, `Tablo`, `useForm`) kullanılmıyor. Dinleyiciler `document`/`window`'a bağlı (`sim.ts`, `ui.ts`, `store.ts`, `views.ts`; `kokIcinde` ile `[data-sa-merkez]` içinde süzülür),
    modül sayfa değiştirince kaldırılmaz. 41 `innerHTML` kullanımı; kaçışlama `esc()` ile elle. Uyum: ekran ortak bileşenlerle yeniden kurulur ya da bilinçli istisna kaydı (çekirdek kararı).
16. Satır içi stil: `style=` 6 hesaplanan değer kalıyor (grafik ölçüleri, geri al süresi; `bagla.ts`, `memory.ts`, `views.ts`), `npm run lint` bunları yakalamıyor (DOĞRULANDI: lint çıkış 0). Ekran 360/768/1280: ÖLÇÜLDÜ (19.10.2026, Chromium, örnek veri + 6 kalem 5 teklifli uydurma talep, yönetici): iş kutusu, talepler, onaylar, dış operasyonlar, malzemeler, tedarikçiler, raporlar ve talep ayrıntısı üç genişlikte açılıyor; belge yatay taşması 0, konsol ve sayfa hatası yok. Kabuğun dar menüsüyle içerik 360'ta 360, 768'de 696, 1280'de 1080 px. Kalan: satır içi stil
    (CSS `@media` kırılımları 640 ile 1180 arasında, 360/768/1280 ayrı denenmedi).
17. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): kalan kısım da yapıldı; `paylasilan/sayfalar.ts` `IKINCI_MENULER` içinde `SATIN_ALMA_IKINCI_MENU`, `paylasilan/sayfalar/satin-alma.ts` "sayacUcu: '/satin-alma-menu-sayaclari'".
    Önceki metin: KAPANDI: dört sayfa tek sayfa (`/satin-alma`) oldu; bölümler `SATIN_ALMA_IKINCI_MENU` ile veri olarak bildirilir, kabuk çizer; prototipin menüsü gizli
    (`merkez/yerlesim.css`). Kalan: toplayıcı satırı (`IKINCI_MENULER`) çekirdek isteğidir (CEKIRDEK-ISTEKLERI.md Ç1); menü sayaçları yok (`sayacUcu` verilmedi;
    prototipin menüsündeki sayılar görünmez).
   GÜNCELLENDİ (tur 4, kullanıcı kararı SA1): menü kullanıcının 7 maddesidir (iş kutusu, talepler, onaylar, malzemeler, tedarikçiler, raporlar, ayarlar),
   sayaçlı (`GET /satin-alma-menu-sayaclari`, `yetki: 'oturum'`, sayı yetkiye göre süzülür; şartnamedeki kalıp). Madde başına rota; "Taleplerim" ve
   "Teslim bekleyenler" yok. Prototipin menüsü artık çizilmez (`renderNav` boş).
18. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kullanıcı kararı, madde kendisi "uyum borcu değil, bilgi" diyor (V-30, V-31).
    Eski metin: Canlı güncelleme ve yedek yok (V-30, V-31); veri açılışta ve reddedilen yazmadan sonra yenilenir. Kullanıcı kararı; uyum borcu değil, bilgi.
19. KAPANDI (19.10.2026): sayfa testleri `menu.test.ts`: her ikinci menü maddesinin rotası var, menü dışında tek rota Taleplerim; rol setleri (satın alma, müdür, planlama, finans, talep eden) menüde doğru maddeleri görür. Rol satırlarını sunucuda `kisiler/rol-dagilimi.test.ts` sınar.
    Eski metin: KISMEN KAPANDI (borç turu 17.10.2026): ekran çizimi testi `merkez/cizim.test.ts` (her bölüm ve üç rolde ana sayfa uydurma veriyle hatasız, boş ya da "undefined"/"NaN" metinsiz çizilir). Kalan: sayfa testleri (rota, rol seti) bağlamada, rol satırları gelince.
   GÜNCELLENDİ (tur 4): `gorunumler.test.ts` menüyle birlikte kalktı; madde rotaları teste bağlı değil.

20. Ölü akış: `merkez/ui.ts:314-318, 967-984` yedek indirme/geri yükleme (`export-json`, `import-json`, `do-import`), örnek veri silme (`del-samples`) ve TCMB (`mk-tcmb`) işleyicileri kodda duruyor;
    taşıyıcı (`tasiyici.ts`) bunların hepsini reddediyor (V-30, kırmızı çizgi). DOĞRULANDI (koddan). Uyum: ekran yeniden kurulurken işleyiciler ve modal kodu silinir.
   KAPANDI (tur 4): kullanıcı işleyicileri kaldırdı (yedek, içe aktarma, örnek veri, TCMB). Boş `mk-tcmb-st` durum alanı da kalktı (borç turu 17.10.2026).
21. KAPANDI: SAT-42 ayrı testte, atlanmadan koşar.
22. Okuma kaynakları (2. tur, #162): `GET /satin-alma-acilis` çekirdeğin okuma yetkisini (`{ biri: SATIN_ALMA_ISLEMLERI }`) taşır (KAPANDI). Kalan: açılış
   rol süzmeli tek bütündür; kaynaklara (talepler, talep, tedarikçiler, katalog, ayarlar) ve sayfalı listeye (`#cekirdek/liste.ts`) bölünmedi, `GET /satin-alma-teslimleri`
   de sayfasız. VARSAYIM: bölmek ekranı değiştirir (prototip bütün veriyi bellekte süzer); ekran değişikliğiyle birlikte yapılır.
   GÜNCELLENDİ (tur 4): `GET /satin-alma-teslimleri` kalktı.
23. Dokunma hedefleri (ekran ölçümü B5, 08.10.2026; `/mnt/project-files/tur3-raporlar/ekran-olcumu.md`): bütün bölümlerde üst araçlar 44 px altında (arama 39,
    kur düğmesi 34, "Yeni talep" 34, Liste/Akış 32, "Kataloga aktar" 27 px); Ayarlar ekranında 54 hedefin 22'si 44 px altı; 1280'de liste başlığı sıralama
    düğmeleri 19 px yüksek. 24 px altı hedef 360 ve 768'de yok. Kod yok; ekran ortak bileşenlere geçerken (madde 15) kapanır.
24. KAPANDI (bağlama tur 1, SH1 a): `teslim-bilgisi.ts` silindi. Teslim `satin_alma_teslim` (yalnız ekleme) tablosunda; stok mal kabulde `teslimIsle`, düzeltmede `teslimGeriAl` çağırır. Kalanı aşan teslim reddedilmez, sipariş satırında `fazlaTeslim` olarak görünür. Kalite GKK ile gelir (boş).
    Eski metin: Teslim bilgisi geçici karşılıkla okunur (tur 4): `teslim-bilgisi.ts` `teslimAlinanlar` (stok) ve `gkkSonuclari` (rota/kalite) boş harita döner;
    sipariş "teslim bekleniyor"da, kalite boş kalır, talep "teslim alındı"ya geçmez. DOĞRULANDI (kod). Uyum: stok ve rota gelince gövdeler ilgili `disari.ts`
    ithaliyle değişir (BASKA-MODUL-ISTEKLERI.md). Bu arada depodaki satın alma siparişini teslim alacak ekran yok.
25. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kurgu değişti, firma musteri-tedarikci'de (#1164, göç `20261013214000_musteri_tedarikci_firma.sql`); servis `servis.ts` "../musteri-tedarikci/disari.ts" ithal eder, form firma seçer, yazmaz.
    Eski metin: Tedarikçi formu firma yazmaz (tur 4, kullanıcı kararı SA2): teslimin V-35'i (form firma alanlarını `firmalar`'a yazar) ve `../firmalar/disari.ts`
    ithali uygulanmadı; ayrı firmalar modülü yok, firma finansta açılır (madde 2). Teslimin `/firmalar/ac` ile kurulan testleri uydurma firmaya çevrildi.
26. KAPANDI (#331): Tablette sol ikinci menü (teslimin Ç5'i, U8): bütün modülleri etkiler; bu dalda yapılmadı, ortak arayüz listesine gitti (kullanıcı kararı).
27. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): göç koşulu uygulandı (`20261008133000_satin_alma_teslim_stokta.sql` "malzeme_id IS NOT NULL"); yapılacak iş yok.
    Eski metin: Göç (tur 4) teslim sütunlarına ek olarak eski `malzeme_id` dolu kaydı da sayar ve durur. VARSAYIM: anlamı değişen sütun sessizce silinmesin diye;
    geri alma ucuz (koşul göçten çıkar). Bugün iki koşul da boş tabloda geçer (test).
28. Tablette dolu teklif ekranı sıkışıyor (U8 sonrası ölçüm, kart #325, 08.10.2026; uydurma talep: 6 kalem, 5 teklif; 768x1024 pencere, içerik dar menüde 624, geniş menüde 448 px).
    Sayfa ve içerik taşması yok; tablolar kendi kabında yatay kayıyor. DOĞRULANDI (Chromium ölçümü ve ekran görüntüsü, proje dosyası `ortak-arayuz/u8/satin-alma/`).
    - 448: sıralama listesinde tedarikçi adı ve "31.626 ₺ net" kelime kelime kırılıyor, satır yaklaşık bir buçuk kat uzuyor; "1 kalem eksik" etiketi puanın üstüne biniyor;
      karşılaştırma bölümü özetindeki tutar kesiliyor; matris 6 sütunun 2'sini, paylaştırma 5'in 2'sini, teklif tablosu 6'nın 2'sini gösteriyor; arama kutusu simgeye iniyor.
    - 624: "1 kalem eksik" etiketi puana değiyor (704'te de aynı, yani U8'den önce de vardı); matris 3/6, paylaştırma 3/5, teklif tablosu 3/6 sütun.
    - Neden: `merkez/styles.css` kırılımları pencere genişliğine bakıyor (`.rank` 760, `.bulk` ve `.simt` 700, `.steps` 1180); 768 pencerede içerik 448 iken masaüstü kuralları geçerli.
    - KAPANDI (19.10.2026): `.rank` (728), `.bulk` ve `.simt` (668) kırılımları `@container` ile kendi kabına (panel ya da pencere gövdesi) bağlandı; eşik prototipin pencere eşiğinin içerik karşılığı. ÖLÇÜLDÜ (Chromium, panel içinde): 768 pencerede panel 626 px iken önce sıralama 4 sütun ve kalem sütunu 240 px, sonra 3 sütun ve 132 px; 360 ve 1280 değişmedi. `.steps` kuralı kullanılmıyor (işaretlemede yok), dokunulmadı. Dar menüyle içerikte taşma yok (madde 16).
    - İstek: bu kırılımlar içerik kabına (`@container`, `.matrix`'te olduğu gibi) bağlansın. Kabukta değişiklik yapılmadı (kullanıcı kararı); ara çözüm menüyü daraltmak ya da yatay tablet.

29. KAPANDI (bağlama tur 1, SA4 a): onay düğmeleri yalnız onay bekleyen talepte, sipariş düğmesi yalnız onaylı kararda görünür (`merkez/views.ts`); önce/sonra görüntüsü proje dosyası `bagla/ekran/`.
    Eski metin: Denetim bulguları B-001, B-002, B-010 sunucuda kapandı (kart #162, dal `162-satin-alma-5`); ekrana dokunulmadı, ekranın göreceği fark:
    - Kararı veren ve karar tarihi sunucunun (oturum ve sunucu saati). Ekranda girilen kişi ve tarih kayıtta yok sayılır, cevaptaki değer ekrana döner.
    - Onaylanmamış kararla siparişe geçiş, onaylanmış kararı değiştirmek ve onaydaki olmayan talebe onay eklemek 422 döner. Ekran bu düğmeleri saklamaz;
      kullanıcı reddedilen kaydın iletisini görür. Uyum: düğmeler `approvalState` ile gizlenir ya da pasif olur (bağlamada).
    - Senaryonun kişisi ve oluşturma zamanı sunucunun; ilk kayıttan sonra korunur.
30. KAPANDI (bağlama tur 1, SA5 a): Karar 10 geçerli; SAT-56 metni "sunucu ekranın değerini yok sayar, kendisi hesaplar" oldu (`ON-PAKET-satin-alma.md`, `KURAL-TEST.md`).
    Eski metin: SAT-56 metni ile onaylı Karar 10 farklı: SAT-56 "ekranın gönderdiği değer farklıysa reddeder" der; kod istemcinin `ilkToplam` değerini yok sayar ve
    `satin_alma_teklif_toplami` ile kendisi yazar (DOĞRULANDI `sorgular.ts`). Net bugünkü maliyet ve önerilen kaydedilmez (Karar 10: karar destek ekranda).
    Test: sunucu `SAT-13 SAT-56`, ekran `kurallar-ekran.test.ts` aynı fikstürde 125 bulur. Hangi metnin geçerli olacağı bağlamada sorulur.
31. KAPANDI (kullanıcı kararı 17.10.2026, "SAT-68: Kalsın"; kural metni ekrandaki davranışa göre düzeltildi). Eski metin: SAT-68 ekranda kuraldan farklı (DOĞRULANDI `merkez/store.ts` `persistUndoable`, `merkez/ui.ts` `cancel-req`): silme 8 saniye yazılmadan bekletilir, geri alınırsa
    hiç yazılmaz (sunucuda yeniden yazma yok). İptal ise geri alınabilir değil; hemen yazılır, sonra durum elle önceki aşamaya çevrilir (sunucu bu geçişe izin verir, test SAT-68).
32. KAPANDI (borç turu 17.10.2026): SAT-61 eşik karşılaştırması saf `calc.ts` `fiyatUyarisi`nda; "pazarlık payı" (`merkez/ui.ts`) ve fiyat artışı uyarısı (`views.ts` `memoryInsights`) onu çağırır; test `kurallar-ekran.test.ts` SAT-61 (eşikte, altında, düşüşte, sapma yokken).
    SAT-60 bütçe kullanımı yalnız sipariş verilmiş ve teslim alınmış talepleri sayar; onaydaki talep sayılmaz (DOĞRULANDI `calc.ts` `spendLines`, test SAT-60).

33. Bağlama tur 1 (kart #162, dal `162-satin-alma-bagla`) açık kalanlar:
    - SA2 bağ KAPANDI (göç `20261009024000_satin_alma_katalog_malzeme_bagi.sql`, ekran kart seçer). Kopya sütunlar KAPANDI (249 a): `kod`, `ad`, `birim`
      düştü (göç `20261019108500_satin_alma_katalog_kopya.sql`), SAT-59 (M- kodu) kalktı. `kategori` kalır: kartta yalnız sarf, demirbaş ve hizmette kategori var.
      Açık: `satin-alma.katalog-kodu` numara ayarı artık kullanılmıyor (`paylasilan/ayarlar/satin-alma.ts`, `ayarlar/numara.test.ts`); ayarın silinmesi ayrı iş (ayarlar ekranında görünür).
    - VARSAYIM: talep edenin "Malzemeler ve Hizmetler" sayfasını görme yetkisi olmayabilir (BİLMİYORUM, yetki matrisinde); bu yüzden ekranda ikinci yol da yazılı:
      nota "kart istenir" yazılır, satın alma kartı açtırır ve "Kataloğa bağla" ile kalemi bağlar. Ayrı bir "kart isteği" kaydı yok.
    - Sayfa "Malzemeler ve Hizmetler" olarak yeniden adlanacak (malzemeler konusu). Ekrandaki bağlantı ve sunucunun hata iletisi adı sabit yazmaz,
      `paylasilan/sayfalar/malzemeler.ts` `MALZEMELER_SAYFALARI[0].baslik`tan okur; ad değişince kendiliğinden izler. KAPANDI (borç değerlendirmesi 17.10.2026): belgelerdeki eski ad "Malzemeler ve Hizmetler" yapıldı.
    - KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): SAT-75 (#1192) testli (`satin-alma.test.ts` "SAT-75 #1192", `kurallar.test.ts` SAT-75). Eski metin: Hizmet: satın alma yalnız ALINAN hizmeti seçer (sunucuda ret, testli); malzemeler hizmet türünü ve yönünü ekleyince yazılır.
    - Fason hizmet siparişi rota adımına bağlı açılış: bu turda yalnız seçenek listesi (BASKA-MODUL-ISTEKLERI.md "Üretim emirleri ve rota"); fason firma ve konumu Aşama 2'nin sonraki turunda.
    - `satin_alma_ayar.kur_tarihi` sütunu artık okunmuyor ve yazılmıyor (kur tarihi finanstan); ayrı göçle düşer. VARSAYIM: dolu sütun sorulmadan düşmesin diye bu turda bırakıldı.

34. Ana sayfadan talep (kart #375) açık kalanlar:
    - KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): kart ortak glob ile yükleniyor (`istemci/src/ortak/rota/ana-sayfa.ts` "../../moduller/*/ana-sayfa.tsx", `satin-alma/ana-sayfa.tsx` `anaSayfaKartlari`). Eski metin: Ana sayfa kartı `ana-sayfa.tsx` ortak arayüzün kart yapısı (#172) birleşince bağlanır; ekran onayı birleşik önce/sonra görüntüsüyle.
    - KAPANDI (kart #1192, SAT-75): hizmet talebi yalnız alınan hizmet kartını seçer (sunucuda ret, testli).
    - KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): hızlı talep rol satırları göç `20261009065000_kisiler_satin_alma_islemleri.sql`'de (planlama_proje, cam, bakim, kalite, depo `satin-alma.talep-ac`). Eski metin: Rol satırları (planlama_proje, cam, bakim, kalite, depo, mudur, satin_alma; operator yok) bu iş birleştikten sonra çekirdekten girer.
    - KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): uygulanmış, `servis.ts` hızlı talep "durum: 'taslak'". Eski metin: VARSAYIM: hızlı talep `taslak` açılır (satın almanın iş kutusunda görünür; talep eden düzeltip silebilir). Geri alma ucuz: tek satır.
    - KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): uygulanmış, `servis.ts` #375 yorumu "kartsız kalem 'kart bekliyor' kalır" (VARSAYIM: yalnız yorum ve akış okundu). Eski metin: VARSAYIM: kart bekleyen kalem satın alma ekranında talep düzenlenip katalogdaki kaleme yazılarak bağlanır; ayrı "karta bağla" düğmesi yok.

35. KAPANDI (kart #162, SA3 a tamamlama): talep açma ve kaydetme, teklifte ve sabit kurda geçen para biriminin `satin_alma_kur` satırını yazmadan önce ekler (`ON CONFLICT DO NOTHING`, faiz tablo varsayılanı, sıra sona; finansın kur tablosuna yazılmaz); ayarlar hiç kaydedilmemiş kurulumda döviz teklifi kaydedilir. Test `satin-alma.test.ts` SA3 a.
    Eski metin: ve teklif (kart #162, SA3 a uygulama eksiği): yeni kurulumda finansta kuru olan para birimi ayarlarda görünür ama `satin_alma_kur` satırı ayarlar kaydedilene kadar yoktur; o para biriminde teklif `satin_alma_teklif` yabancı anahtarına takılır
    (409 `BAGIMLI_KAYIT`, genel ileti). DOĞRULANDI (test koşusu, yönetici, finansta USD kuru varken ayarlar kaydedilmeden USD teklifi). Uyum: teklif ya da ayar ucu para birimini kendisi ekler ya da ileti "Ayarlar'da kaydedin" der (karar bekler).

36. KAPANDI (kart #162): siparişteyken siparişli kalemin miktar ve birimi değişmez, kalem silinmez; teslimi alınmış kalem talep onaya geri alınsa da değişmez (`kurallar.ts` `siparisliKalemReddi`). Kullanıcı kararı (10.10.2026): değişiklik kayıtlı ve onaylı yapılır; komut `siparis-kalemi-degistir` (onay yetkisi, gerekçe, hareket kaydı, teslimden aşağı inmez). Test `satin-alma.test.ts` Borç 36 (iki test), `tasiyici.test.ts` Borç 36.
37. KAPANDI (kart #162): ekran finansın güncel kurunu yalnız kur gününün teklifine önerir; başka günün teklifinde kur boşsa kursuz gider, sunucu o günün kurunu finanstan alır ya da ister (`calc.ts` `otomatikKur`, `kaydedilecekKur`, `kurIstenir`). Test `kurallar-ekran.test.ts` borç 37.
38. KAPANDI (kart #162): finansın para birimi yalnız hiç kaydedilmemiş ayarlara önerilir (`ayarlariKur`, ayar sürümü 1); kaydedilmiş listeden kaldırılan para birimi geri gelmez. Test `satin-alma.test.ts` Borç 38. Kullanıcı kararı (10.10.2026): önerilen ve teklifle eklenen para biriminin faizi ekran varsayılanıdır (USD 0,4, EUR 0,3, GBP 0,4; `VARSAYILAN_AYLIK_FAIZ`).
39. KAPANDI (kart #162): kararlı talepte talep edenin kaydet cevabı ve Taleplerim listesi kararsız, teklifsiz ve tedarikçisizdir; açılış 403 (uç testi `satin-alma.test.ts` Borç 39; görünüm kaldırılınca kırmızı).
40. KISMEN KAPANDI (kart #542, dış operasyonlar): liste üretim emirlerinin `fasonIsEmirleri` işlevinden gelir (U3, #838; kullanıcı onayı 12.10.2026 13:36). Gidiş, dönüş ve tamamlama bu sayfadan üretim emirlerinin fason uçlarıyla yazılır (#995; satın alma rolü fason yetkisini #963 ile aldı). AÇIK: firma ve termin yazma komutu (U2, işlem `uretim-emirleri.fason-yaz`) teslim edince: ithal `../uretim-emirleri/disari.ts`, sayfaya firma ve termin yazımı, hizmet siparişinde iş emri seçimi (S3, `satin_alma_siparis_satiri.is_emri_id`). Rol satırı (sayfa ve komut) rol tablosuyla kullanıcıya sorulur.
41. KAPANDI (karar 143 a, 19.10.2026): siparişe bağlı iş emri silinmez; önce sipariş bağı kaldırılır. Yabancı anahtar `satin_alma_siparis_satiri_is_emri` `ON DELETE` kuralsız (NO ACTION) kalır, silme 409 BAGIMLI_KAYIT ile düşer; göç gerekmedi. Test `satin-alma.test.ts` "143 a". Açık iki uç: ileti genel (üretim emirlerinden özel ileti istendi, BASKA-MODUL-ISTEKLERI); bağı yazan ve kaldıran komut U3/S3 ile gelecek (bugün bağ yazılmıyor).
    Eski metin: `satin_alma_siparis_satiri.is_emri_id` yabancı anahtarı `ON DELETE` kuralsız; bağ yazılmaya başlayınca karar: silme reddi, `SET NULL` ya da satın almaya sorma.
42. KAPANDI (mimari geçiş şeridi 9, G2 "onaylayan adı elle yazılıyor"): onay ve ret kaydında kişi ve ad sunucuda oturumdan yazılır (`servis.ts` `onayEkle(..., k.id, ...)`; istemcinin `kisiId` ve `kisiAdi` değeri yok sayılır, mevcut test `satin-alma.test.ts` SAT-29 SAT-30). Ekranda "Onaylayan" alanı salt okunur oturum adıdır; elle yazılan ad artık talep hareket metnine de girmez (`merkez/ui.ts` `approve`/`reject`; test `merkez/onay-adi.test.ts`, eski kodda kırmızı).

43. KISMEN KAPANDI (kart #160, finansın "faiz finanstan" isteği): ayarlar cevabındaki güncel aylık faiz (`ayarlariKur`), finansın `faizler(db, bugun)` okumasındaki geçerli orandan gelir; o para birimi için finansta oran yoksa `satin_alma_kur.aylik_faiz_yuzdesi` kalır, başka hiçbir hesap değişmedi (kural `aylikFaiz`, testler `satin-alma.test.ts` Kart 160, `hesap-kayit.test.ts`).
  AÇIK kalan: teklif ve siparişte o gün kullanılan faizin kendi kaydında saklanması (sütun gerekir, göç; çekirdek şeridi) ve ayar ekranındaki faiz alanının yalnız gösterilmesi (ekran işi). Not: ayar formu görünen finans faizini kaydette `satin_alma_kur`a geri yazar; finans oranı sonradan düşse bile satın almanın yedek oranı o değerdir.

## Bağlamada kapanmayacak (bilgi)

- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): bilgi notu, iş yok. Eski metin: Teslimdeki `NOTLAR.md` olduğu gibi duruyor.
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): metin eski; firma modülü artık var (musteri-tedarikci, #1164). Eski metin: Firmalar modülü depoda olmayacak (firma kaydı finans modülünde, kart #246); finanstan beklenenler BASKA-MODUL-ISTEKLERI.md'de.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): `teslim-al` ucu ve Teslim bekleyenler ekranı kalktı (`uclar.ts`'te `teslim-al` yok; madde 9 ve 22 "kalktı"). Eski metin: Stok ile çakışma (Aşama 2'de sorulur): mal kabul stok modülündedir (sabit kimlik), satın almanın kendi `teslim-al` ucu ve Teslim bekleyenler ekranı var.

## Kart #1124 (ödeme planı)

- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): finans ekranı gösteriyor (`istemci/src/moduller/finans/cerceve/finans.html` `data-beklenen-odemeler`, `finans/kopru.ts` `/finans/beklenen-odemeler`). Eski metin: Finans ekranı (`finans.html`) siparişten beklenen ödemeleri henüz göstermiyor; veri `GET /finans/beklenen-odemeler` ucunda hazır. Bağlamada kapanacak (finansın ekran işi; bu dalda finans ekranına dokunulmadı).
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): madde kendisi "risk değil, bakım notu" diyor. Eski metin: Plan yazımı ile fatura bağlanması aynı anda gelirse sıralanmaz (fatura bağı talebi kilitlemez); plan faturadan sonra yazılabilir. Risk değil, bakım notu:
  sonuç sırayla gelmeleriyle aynıdır, çünkü finans `beklenenOdemeler` faturası bağlı siparişin planını her durumda listeden düşürür
  (`finans/sorgular.ts` `WHERE NOT EXISTS ... finans_belge`). DOĞRULANDI (sorgu).
- KAPANDI (bilgi maddesi; doğrulama 19.10.2026): iki varsayılan aynı ve ikisi de testle sabit (`kurallar.test.ts` SAT-70 `VARSAYILAN_ONAY_LIMITLERI`, `merkez/hesap-kayit.test.ts` `DEFAULT_SETTINGS.approvalLimits`: 50000, 250000, 1000000, sınırsız); portal `portal/servis.ts` `onayLimitleri` ithaliyle okur. DOĞRULANDI (dosyalar ve testler).
  Onay limitleri tek kaynak (kullanıcı kararı 16.10.2026, "Satın alma"; portal basamağı "Müdür + GM"): `satin_alma_onay_limiti` hem satın alma ekranının hem portalın eşiğidir.
  Portal `disari.ts` `onayLimitleri` ile okur; tablo boşsa `kurallar.ts` `VARSAYILAN_ONAY_LIMITLERI` (ekranın `merkez/constants.ts` varsayılanıyla aynı tutulmalı; SAT-70 ve SA-HESAP H1 iki tarafı ayrı sabitler).
  Basamak adları satın almada yalnız bilgidir; onayı `satin-alma.onayla` verir. Portalda rol eşlemesi ayrıdır (50 bin üstü Satın alma müdürü, 250 bin üstü ayrıca Genel müdür).
