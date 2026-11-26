# Başka modül istekleri: smartes (kart #778)

Kullanılan var olan işlevler: `planlanacakIsEmirleri`, `isEmriOzeti` (uretim-emirleri), `malzemeOzetleri` (malzemeler),
`istasyonlar`, `aktifMakineler`, `operasyonTipleri` (istasyonlar), `durusNedenleriniListele` (durus-nedenleri), `sistemAyariOku` (ayarlar).
Bu iş o modüllere yazmadı; aşağıdakiler imzalı istektir.

## uretim-emirleri
1. `PlanIsEmri`'ne `istasyonId` eklensin. Neden: bugün her iş için ayrıca `isEmriOzeti` çağrılıyor (`servis.ts` `gonderimTuru`), tur başına N sorgu.
2. `PlanIsEmri`'ne operasyonun `operasyonTipiId`'si eklensin. Neden: SmartES OperationCode bugün operasyon numarası (VARSAYIM);
   operasyon tipi eşlemesi (`smartes_esleme` tur `operasyon-tipi`) ancak bu alanla kullanılır.

## Aşama 2 (bağlama)
3. SmartES'ten okunan sağlam ve red sayılarının üretim kaydına (uretim-emirleri) aktarılması: sahibi uretim-emirleri; smartes yalnız okur ve
   `disari.ts` ile verir. Hangi akışla (otomatik ya da onaylı) kullanıcı kararı.
4. Duruşların TMI duruş kaydına bağlanması: `smartes_esleme` tur `durus-nedeni` hazır; yazma sahibi modülde.

## Tanım gönderimi (isteğe bağlı iyileştirme)
5. malzemeler: tüm aktif stok kartlarını (kod, ad, tür) tek işlevle verme isteği. Neden: tanım gönderimi bugün `malzemeAra` ile 200'lük sayfaları
   dolaşır (`tanim-kaynagi.ts`); iş çalışıyor, istek yalnız sorgu sayısını azaltır. Kaynak `TanimKaynagi` arayüzünün arkasında, değişirse yalnız o dosya değişir.

## Makine bulguları (3192)
6. uretim-emirleri: makine başına CORE duruş aralıklarını (başlangıç, bitiş, neden) veren `disari.ts` işlevi. Neden: "Nedensiz duruş" bugün
   yalnız SmartES'in kendi duruş kaydına bakıyor; operatörün CORE terminalinde girdiği duruş nedeni görülmüyor (bugün yalnız `istasyonDurusSureleri` var).

## 3760: bu yamada başka modüllere yazılanlar (dış yazar, kullanıcı onayıyla "Böyle gelsin")
7. istasyonlar: makine başına üretim kaynağı (göç `20261126135359`), `uretimKaynaklari`, `uretimKaynakSecimleri`, `uretimKaynagiDegistir` (`disari.ts`); istasyon
   ve makine formu kaynağı salt okunur gösterir (istasyon güncelleme gövdesi kaynağı artık göndermez).
8. uretim-emirleri: SmartES üretim kilidi (`smartesUretiminiDenetle`, anahtar kapalıyken makine okunmaz), `smartesHareketi`, `smartesHataliKaydi` (`disari.ts`);
   SmartES kaynaklı durdurma pasif nedeni kabul eder. İstek: duruş olayının nedenini sonradan düzelten bir düzeltme kaydı (3760 karar 8; bugün olay değişmez).
9. arkon: terminal ekranında SmartES şeridi ve kapalı düğmeler (operatör, biten iş).
