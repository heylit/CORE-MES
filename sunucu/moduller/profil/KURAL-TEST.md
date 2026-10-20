# Kural -> test (profil)

Testler: `kurallar.test.ts` (saf), `profil.test.ts` (gerçek PostgreSQL, gerçek giriş), `istemci/src/moduller/profil/profil.test.tsx`.

| Kural | Test |
|---|---|
| PRF-1 Profilde son 50 geri bildirim, yeniden eskiye | `PRF: gönderilen kayıt yazanın profilinde görünür ...` |
| PRF-2 İzin listesi bir yıl geri ve ileri; 29 Şubat geçerli güne düşer | `PRF-2/3 ...`; `PRF-2: 29 Şubat kayınca geçerli güne düşer` |
| PRF-3 Fazla mesai yılın başından bugüne | `PRF-2/3 ...` |
| PRF-4 Mesai toplamı yalnız saati girilmiş satırlar; hiç yoksa null | `PRF-4 ...`; `İK kartına bağlı kişi ...` (toplam null) |
| Kişi ve zaman sunucudan; gövde başka kişiyi seçemez | `gövde başka kişiyi seçemez ...` |
| Konu, tür ve metin (3-2000) | `profil_geri_bildirim_konu_gecerli`, `_tur_gecerli`, `_metin_gecerli` kısıtları; `gövde başka kişiyi seçemez; geçersiz konu, tür ve kısa metin reddedilir` |
| Gönderilen kayıt değişmez ve silinmez | `profil_geri_bildirim_degismez` tetikleyicisi; `gönderilen kayıt değişmez ve silinmez (yalnız ekleme)` |
| Yinelenen gönderim tek kayıt | `aynı istek kimliğiyle yinelenen gönderim ikinci kayıt açmaz` |
| Başkasının yazdığını yalnız okuma işlemi olan görür | `başkalarının yazdıklarını yalnız profil.geri-bildirim-oku okur ...` |
| İK kartından ücret, kimlik, banka alanı dönmez | `İK kartına bağlı kişi kendi kartını ... ücret ve kimlik alanı dönmez` |
