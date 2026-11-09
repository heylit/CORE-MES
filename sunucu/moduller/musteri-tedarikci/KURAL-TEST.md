# Kural ve test: musteri-tedarikci

Her kuralın kabul ve ret testi vardır. Finanstan gelen kuralın eski numarası parantezde; test başlıkları eski numarayı korur.

| Kural | Kabul testi | Ret testi |
|---|---|---|
| MT-1 (D-9) vergi no biçimi yalnız TR'de; yabancıda 30 karakter | kurallar "MT-1 ... yabancı firmada", firma "D-9" | kurallar "MT-1 ... harf ve kısa numara reddedilir", firma "D-9" |
| MT-2 tür süzgeci "ikisi"ni kapsar | kurallar "MT-2", firma "liste: tür süzgeci" | aynı test: "ikisi" süzgeci tek türü getirmez |
| MT-3 (FNS-49) arama en çok 50 | kurallar "MT-3", firma "FNS-49" | firma "FNS-49" (500 isteyen 50 alır) |
| MT-4 (FNS-43, FNS-44) ad boş olamaz; kod, vergi no, Logo kodları tekil | firma "FNS-43", "FNS-44" (dolu ad, boş kod tekrarı) | aynı testler (400, kısıt, CAKISMA) |
| MT-5 (FNS-45) Logo'ya gitmiş firmanın kodu değişmez | kurallar "MT-5", firma "FNS-45" (öteki alanlar değişir) | aynı testler |
| MT-6 (FNS-47) firma silinmez | silme ucu yok | firma "FNS-47" (veritabanı reddeder) |
| MT-7 koordinat ikisi birlikte | kurallar "MT-7", firma "MT-7 adres" (ikisi boş, ikisi dolu) | aynı testler (DOGRULAMA, `koordinat_butun` kısıtı, 91 enlem 400) |
| MT-8 (FNS-53) durum geçişi yalnız ters durumdan | kurallar "MT-8", firma "FNS-53" | aynı testler (422) |
| MT-9 adres adı firma içinde harf duyarsız tekil | firma "MT-9 adres" (başka firmada aynı ad) | aynı test (CAKISMA, alan ad) |
| MT-10 firma başına en çok 50 adres | kurallar "MT-10", firma "MT-10 adres" (49'dan 50'ye) | aynı test (GECERSIZ, sayı 50 kalır) |
| MT-12 düzeltmede gönderilmeyen koordinat korunur, null siler | firma "MT-12 koordinat" (korunur, null siler) | aynı test (yarım koordinat DOGRULAMA) |
| MT-13 (265 a) müşteri sınıfı A, B, C ya da boş (`musteri_tedarikci_firma_musteri_sinifi`); düzeltmede gönderilmezse korunur, null siler; disari `musteriSiniflari` boşu null verir | firma "MT-13 ..." | aynı test (D sınıfı DOGRULAMA ve kısıt; okuyan 403) |
| MT-20 (kart 1812) fason işareti yalnız tedarikçi ya da ikisi türünde | kurallar "MT-20", firma "MT-20" (tedarikçi ve ikisi geçer, işaretsiz müşteriye dönüş geçer) | aynı testler (müşteri + fason 400 alan fason, kayıt açılmaz ve değişmez) |
| MT-21 (kart 1812) müşteri sınıfı tedarikçide boş tutulur; müşteri tedarikçiye dönünce silinir | kurallar "MT-21", firma "MT-21" (ikisi türünde kalır) | aynı testler (tedarikçiye gelen sınıf null yazılır) |
| MT-22 (kart 1812) fason seçicisi bütün aktif fason tedarikçi ve ikisi firmalarını verir; MT-3 sınırı yalnız yazılan aramada | firma "MT-22" (55'ten çok firma, ad sırası) | aynı test (pasif, fasonsuz ve müşteri türü girmez; arama 50'de kalır) |
| MT-11 adres yazması kartın sürümünü artırır; eski sürüm 409 | firma "adres: yazan ekler..." | firma "adres sürüm" (adres değişmez) |
| Yetki: okuma `musteri-tedarikci.oku`, yazma `.yaz` | firma "yetki", "adres yetki" | aynı testler (401, 403, kayıt değişmez) |
| FNS-48 finans rakamı dönmez | firma "FNS-48" | aynı test (alan listesi sabit) |
| Göç S2/S4/S6 | goc "firma satırı ve kimliği aynı kalır..." | aynı test (pasif ve bağsız nokta kopyalanmaz, işlemsiz rol sayfa almaz, silme reddedilir) |
| MT-14 (1260 a) karne dönemi tesis gününde biten kayan 12 ay | kurallar "MT-14" | aynı test (29 Şubat, yıl başı) |
| MT-15 (2456, sürüm 2) teslim termin + 2 gün içindeyse zamanında; tamlık ayrı bileşen | kurallar "MT-15", "MT-16: eksik teslim..." | aynı test (3. gün) |
| MT-16 (2456, sürüm 2) yedi bileşen (lot, PPM, zamanında, tam, teklif, satın alma, Kalite), sürümlü ağırlık; lot kararı puanı; A-D; 3 teslim ve 3 lottan az veride sınıf null, puan verisi olanla; yıllık karne sürüm ve bileşen saklar | kurallar "MT-16, MT-32", karne "MT-16: olaylardan...", "MT-16: yıllık karne hesap sürümünü..." | kurallar "MT-16: 3 teslim...", karne "MT-16: yetersiz veride..." (aynı yıl CAKISMA) |
| MT-17 karne yalnız tedarikçi ya da ikisi türündeki firmaya yazılır | kurallar "MT-17" | karne "MT-17" (422, kayıt açılmaz) |
| MT-18 (kart 1474) gecikme günü = teslim günü - termin; erken eksi, tolerans uygulanmaz | gecikme "MT-18" | aynı test (aynı gün 0, ay ve yıl geçişi) |
| MT-19 (kart 1474) gecikme özeti kaynak başına, yalnız tam teslimden, kayan 12 ay teslim gününe göre; %80 en yakın sıra | gecikme "MT-19", "firma ve kaynak başına..." | gecikme "MT-19 reddedilen" (örneksiz kaynak yok), eksik ve dönem dışı teslim sayılmaz |
| Karne olayı kaldırma (kart 1474): geri alınan kaynak kaydının olayı kalkar, tekrar güvenli | gecikme "kaldırılan olay..." | gecikme "reddedilen kaldırma" (bilinmeyen kaynak, boş anahtar) |
| Karne olayı (1259 c) kaynak ve anahtarla tektir, sonraki karar yerine geçer | karne "olay kaynak ve anahtarla tektir" | karne "reddedilen olay" (geçersiz karar, olmayan firma, `karne_olayi_alanlar` kısıtı) |
| Yetki: karne okuma `musteri-tedarikci.oku`, hizmet puanı `satin-alma.yaz`, yıllık karne `kalite-merkezi.onayla` (V6) | karne "yetki" testleri | aynı testler (401, 403, kayıt açılmaz) |
| MT-23 (kart 1829) para birimi yürürlükteki ISO 4217 kodu (`PARA_BIRIMI_KODLARI`); aynı ad yalnız uyarıdır (ekran) | firma "MT-23" (küçük harf büyür, CHF geçer); istemci "aynı ad uyarısı" | aynı testler (XYZ, XAU, BGN 400 alan paraBirimi, kayıt değişmez; kendi adı uyarı vermez) |
| MT-24 (kart 1936) kodu boş gelen yeni firmaya kod ayar kalıbından verilir (müşteri ve ikisi `musteri-tedarikci.musteri-kodu`, tedarikçi ve fason `musteri-tedarikci.tedarikci-kodu`); elle yazılan kod korunur, çakışan sıra büyük/küçük harf duyarsız atlanır, güncelleme kod vermez | firma-kodu "boş kodlu müşteri ve tedarikçi...", "elle yazılan kod...", "çakışan sıra atlanır", "kalıp Ayarlar'dan değişince..." | firma-kodu "yazma yetkisi olmayan kod alamaz" (403, sayaç ilerlemez), "40 karakteri aşan kalıp" (422, kayıt açılmaz), "güncellemede boş bırakılan kod yeniden verilmez" |
| MT-30 (2118; 2118-1 a, 2118-2 a, 2118-3 a) Logo'dan cari: arama ve okuma yalnız `musteri-tedarikci.yaz`, köprüye transaction dışında gider; eşleşme sırası kayıt no, cari kodu, firma kodu, vergi no; eşleşen varsa yeni kart açılmaz, bağlanır; alınan firmanın kodu ve Logo cari kodu Logo kodudur; bağlama yalnız Logo alanlarını yazar; komutlar köprüye gitmez, kişinin 10 dakikalık okumasını kullanır | logo-cari "LCA-3", "LCA-4", "LCA-6"; kurallar "MT-30" | logo-cari "LCA-1" (403, köprüye istek yok), "LCA-2" (kapalı durum), "LCA-4" (ikinci alma 409, kod kilidi 422), "LCA-5" (okumasız, başkasının okuması, süre dolmuş 409), "LCA-6" (bağlı, farklı cari kodu 422, eski sürüm 409), "LCA-7" (40 karakteri aşan kod) |
| MT-31 (2456) elle 1-5 puan (p - 1) x 25 ile 0-100; değerlendirme yoksa null | kurallar "MT-31" | aynı test (sayı 0) |
| MT-32 (2456) puan verisi olan bileşenlerin ağırlıklı ortalaması; null bileşenin ağırlığı oranla dağılır; ağırlığı 0'dan büyük ve verisi olan otomatik bileşen yoksa puan null (Maliyet A1, N1 2474); grup puanı aynı kuralla | kurallar "MT-16, MT-32", "MT-32" | kurallar "MT-32" (ağırlıksız bileşenle puan null; yalnız elle puanla puan null; otomatik ağırlıklar 0 iken puan null) |
| MT-33 (2456-2 c) ağırlıkları yalnız `musteri-tedarikci.karne-agirlik` değiştirir; okunan sürüm üzerine, toplam 100, gerekçeli; her değişiklik yeni sürüm | kurallar "MT-33", karne "2456-2 c: ..." (yönetici 200, sürüm 3) | aynı test (401/403, toplam 101 ve boş gerekçe 400, eski sürüm 409, kişisiz sürüm kısıtı) |
| 2456-3 a Kalite değerlendirmesini yalnız `kalite-merkezi.onayla` yazar; tür uçtan gelir | karne "2456-3 a: ..." (kalite 200, tür kalite) | aynı test (401/403, gövdedeki tür yok sayılır, müşteri 422) |
