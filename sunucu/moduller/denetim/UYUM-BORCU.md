# denetim: uyum borcu (kart #259 Aşama 1 tur 2; kart #48 3. tur)

Sahip: çekirdek konusu (altyapı parçası, kullanıcı kararı 08.10.2026, H2). Başka konu bu modüle yazmaz.

Durum `9b6582f` üstünde okundu. Her madde: kural / istisna / nerede / nasıl uyumlanır.

## Kullanımı tutan

Yok. Kayıt her yazmada tutuluyor (uç katmanı, `sunucu/uygulama-secenekleri.ts` `denetle: denetimYaz`).

## Kullanımı etkileyen

1. KAPANDI (kart #48): okuma ekranı ve uçları geldi. Müdürün menüde görmesi çekirdek isteğine bağlı (`CEKIRDEK-ISTEKLERI.md` 1).

## Sonra

2. KAPANDI: `KURAL-TEST.md` yazıldı.
3. İçeriği modüle göre süzmek ("yalnız o modülü okuyabilen gövdeyi görür"): hazırlık KAPANDI (H2), kayıt artık ucun modülünü ve yetki
   işlemini tutuyor (`modul`, `yetki`; eski satırlar boş). Süzme ayrı karar.
6. KAPANDI (borç değerlendirmesi 17.10.2026): ayarlar ve yedek dizini çağrıları `modul` ve `yetki` taşır (`ayarlar/servis.ts`, `ayarlar/yedek-dizini.ts`; `ayarlar.test.ts` "değişiklik kaydı uç kaydı gibi modülü ve yetkiyi taşır"). Eski metin: Uç katmanı dışından yazılan kayıt modül ve yetki taşımaz: `ayarlar/servis.ts` `denetimYaz` çağrısı (ayar değişikliği). Kapanış: ayarlar
   kendi yazımını uçtan geçirir ya da çağrıya modül adını ekler (ayarların sahibi). Testsiz kural yok; davranış `denetim.test.ts`'te sabit.
4. Süzgeç seçenekleri (`DISTINCT`) ve sayım bütün tabloyu tarar; kayıt büyürse dizin ya da sayısız liste ayrı karar.
5. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): DNT-01 bilinçli kural, testli (`denetim/kurallar.ts` DNT-01, `kurallar.test.ts`). Metin değerli yol parametreleri (`:kimlik`, `:anahtar`, `:ozet`) listede görünmez (DNT-01); yalnız gövde ucunda.

Tablo adı (`denetim_kaydi`) ve kısıt adları uyumlu (K1 bu modülde istisna gerektirmiyor).

## İkinci menü

Tek maddeli ikinci menü (`paylasilan/sayfalar/denetim.ts`), proje kuralı gereği.
