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
