# Çekirdek istekleri: istasyonlar

1. Okuma ucunda sayfa işlemi (Ç1-A): `uc({ yetki: { biri: ['sayfa.istasyonlar'] } })`. Main'de; bu dal kullanıyor (IS8). Kapandı.
2. İkinci menü: kullanıcının dar istisnasıyla (08.10.2026, T1 a) bu PR'da yapıldı. Menü nesnesi `paylasilan/sayfalar/istasyonlar.ts`'te; toplayıcıdaki
   (`paylasilan/sayfalar.ts`) yalnız istasyonlar kayıt satırı ayrı commit'le eklendi. Kapandı.
3. Araç: `npm run test:modul -- <ad>` Linux'ta sunucu testlerini koşmuyor (`ℹ tests 0`). `araclar/test-modul.ts:46` glob'u çift tırnakla veriyor, kabuk yokken tırnak dosya adına giriyor.
   Öneri: tırnakları yalnız `win32`'de koymak. DOĞRULANDI: `node --test "sunucu/moduller/istasyonlar/**/*.test.ts"` 33 test koşuyor, araç 0.
