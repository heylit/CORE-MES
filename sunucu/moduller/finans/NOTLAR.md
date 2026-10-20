# finans: notlar

## Yapı

- Firma kaydı finanstadır (K-14): `finans_firma`; satın alma, stok ve Logo firmayı `disari.ts` ile alır. Firma uçları ve `disari.ts` finans rakamı döndürmez (FNS-48).
- Para kayıtları (`20261008132300_finans_cekirdek.sql`): hesap, kur, KDV oranı, düzenli ödeme, belge, çek, ödeme, dağıtım, mahsup, virman, bakiye eşitleme, bütçe, ayar, öneri, kapanış, skor. KDV, tevkifat, toplam ve TL karşılıkları hesaplanan sütundur. Dağıtım, mahsup, belge durumu, kilitler, pasif firma/hesap ve silme yasağı tetikleyicilerdedir.
- Fatura Logo'da asıldır (K-1); finans takip katmanıdır. `kaynak`, `logo_kayit_no`, `logo_esleme` alanları Logo köprüsü içindir (köprü yok).
- İşlemler: `finans.firma-oku/yaz` firma kartı; `finans.oku` bütün rakamlar; `finans.yaz` günlük kayıt; `finans.yonet` her iptal, geri alma, tanım ve ayar.

## Ekran

- Yol A: prototip (`istemci/src/moduller/finans/cerceve/finans.html`) çerçevede olduğu gibi. Kabuk ayarı `window.__FINANS_GOMULU` ile verir; `finans.oku` olana kapsam `tam`, yalnız firma yetkisi olana `firma`.
- Tam kipte sunucu verisi prototipin kendi biçimine çevrilir (belge parçaları, avans, çek, düzenli ödeme, bütçe, ayar), bugünkü nakit hesap bakiyelerinin toplamıdır. Her yazma ayrı köprü türüdür (`kopru.ts` `YAZMALAR`), sonra veri yeniden okunur.
- Görünüm ve ikinci menü standart çerçeve sözleşmesiyle (`tmi-gorunum`, sürüm 1) eşlenir; menü anahtarı → prototip görünümü tablosu dosyada `TAM_MENU`.

## Prototipi değiştirmek

`finans.html` kendi kaynağıdır. Gömülü katmanlar dosyada "GÖMÜLÜ MOD" ve "GÖMÜLÜ MOD, TAM KAPSAM" başlıklarıyla başlar. Kullanıcı metni her yerde `esc()` ile basılır (GUVENLIK-DENETIMI.md bölüm 4).
