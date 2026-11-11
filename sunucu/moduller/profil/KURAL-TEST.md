# Kural -> test (profil)

Testler: `kurallar.test.ts` (saf), `profil.test.ts` ve `geri-bildirim-merkezi.test.ts` (gerçek PostgreSQL, gerçek giriş), `istemci/src/moduller/profil/profil.test.tsx`.

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
| PRF-5 Tema kişinindir: dört değer (light, dark, kontrast, gun); kayıt yoksa null ve sürüm 0; sürümle yazılır | `PRF-5: kaydı olmayan kişide tema null ve sürüm 0`; `PRF-5: tema oturum ister ...`; `PRF-5: tema seçimi sürümle yazılır ...`; `PRF-5: tema gövdesi başka kişiyi seçemez ...`; `profil_tema_tercihi_tema_gecerli` kısıtı |
| PRF-6 Mini pano seçimi kişinindir: kapatılanlar tutulur, kayıt yoksa hepsi açık ve öneri kapalı, sürüm 0; sürümle yazılır; en çok 50 anahtar | `PRF-6: kaydı olmayan kişide hepsi açık`; `PRF-6: mini pano seçimi oturum ister ...`; `PRF-6: mini pano seçimi sürümle yazılır ...`; `PRF-6: mini pano gövdesi başka kişiyi seçemez ...`; `profil_mini_pano_tercihi_kapali_sinir` kısıtı |
| PRF-7 Sık kullanılanlar kişinindir (2951): seçilen sırayla tutulur, kayıt yoksa boş ve sürüm 0; sürümle yazılır; en çok 10 sayfa | `PRF-7: kaydı olmayan kişinin ...`; `PRF-7: sık kullanılanlar oturum ister ...`; `PRF-7: sık kullanılanlar seçilen sırayla, sürümle yazılır ...`; `profil_menu_tercihi_sayfalar_sinir` kısıtı |
| PRF-8 Seçilen her yol bilinen bir menü sayfasıdır; bilinmeyen yol reddedilir | `PRF-8: bilinmeyen menü sayfaları ayıklanır`; `PRF-8: menü gövdesi başka kişiyi seçemez ...` |
| PRF-9 Liste kişinin açabildiği sayfalara süzülür: açamadığı sayfa kaydedilmez, yetkisi kalkan sayfa okurken dönmez; yetki modeli değişmez | `PRF-9: liste kişinin açabildiği sayfalara süzülür ...` (kural ve uç testi) |
| GBM-1 Takip satırı olmayan kayıt yenidir | `GBM-1 ...`; `hareketler yalnız eklenir; takip kayıtsız açılmaz` |
| GBM-2 Yanıt açık kaydı yanıtlandıya taşır; çözülmüş ve kapanmış değişmez | `GBM-2 ...`; `GBM-2/3: yanıt rol adıyla imzalanır ...` |
| GBM-3 İmza: yönetici olmayan rollerden sıraca ilkinin adı, yoksa "Yönetim" (karar 2192-2 b) | `GBM-3 ...`; `GBM-2/3 ...` |
| GBM-4 Toplama tek kademe | `GBM-4 ...` (saf ve uç) |
| GBM-5 Pasif kategori yeni seçilmez, kayıttaki kalır | `GBM-5 ...`; `GBM-5 ve sorumlu ...` |
| GBM-6 İlk yanıt süresi ortanca, veri yoksa null | `GBM-6 ...` |
| GBM-7 Özet son altı ay | `GBM-7 ...`; `özet: durum sayıları ...` |
| Takip ve kategori sürümle yazılır | `sürüm: ilk yazım 0 ile ...`; `kategori: aynı ad ...` |
| Hareket yalnız eklenir | `profil_geri_bildirim_hareket_degismez` tetikleyicisi; `hareketler yalnız eklenir ...` |
| GBM-8 Yeni kayıt okuyanlara; uygulama konulu ayrı türle | `GBM-8 ...`; `GBM-8/9: yeni kayıt okuyanlara ...` |
| GBM-9 Yanıt ve sonuç yalnız yazana; sonuç bir kez; yapan kendisi almaz | `GBM-9 ...`; `GBM-8/9: ...` |
