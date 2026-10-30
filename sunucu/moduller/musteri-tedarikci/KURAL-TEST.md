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
| MT-11 adres yazması kartın sürümünü artırır; eski sürüm 409 | firma "adres: yazan ekler..." | firma "adres sürüm" (adres değişmez) |
| Yetki: okuma `musteri-tedarikci.oku`, yazma `.yaz` | firma "yetki", "adres yetki" | aynı testler (401, 403, kayıt değişmez) |
| FNS-48 finans rakamı dönmez | firma "FNS-48" | aynı test (alan listesi sabit) |
| Göç S2/S4/S6 | goc "firma satırı ve kimliği aynı kalır..." | aynı test (pasif ve bağsız nokta kopyalanmaz, işlemsiz rol sayfa almaz, silme reddedilir) |
| MT-14 (1260 a) karne dönemi tesis gününde biten kayan 12 ay | kurallar "MT-14" | aynı test (29 Şubat, yıl başı) |
| MT-15 tam teslim termin + 2 gün içindeyse zamanında | kurallar "MT-15" | aynı test (3. gün, eksik teslim) |
| MT-16 (1260 a) puan 40/40/20, hizmetsiz 50/50; lot kararı puanı; A-D; 3 teslim ve 3 lottan az veride puan ve sınıf null | kurallar "MT-16", karne "MT-16: olaylardan..." | kurallar "MT-16: 3 teslim...", karne "MT-16: yetersiz veride..." (aynı yıl CAKISMA) |
| MT-17 karne yalnız tedarikçi ya da ikisi türündeki firmaya yazılır | kurallar "MT-17" | karne "MT-17" (422, kayıt açılmaz) |
| Karne olayı (1259 c) kaynak ve anahtarla tektir, sonraki karar yerine geçer | karne "olay kaynak ve anahtarla tektir" | karne "reddedilen olay" (geçersiz karar, olmayan firma, `karne_olayi_alanlar` kısıtı) |
| Yetki: karne okuma `musteri-tedarikci.oku`, hizmet puanı `satin-alma.yaz`, yıllık karne `kalite-merkezi.onayla` (V6) | karne "yetki" testleri | aynı testler (401, 403, kayıt açılmaz) |
