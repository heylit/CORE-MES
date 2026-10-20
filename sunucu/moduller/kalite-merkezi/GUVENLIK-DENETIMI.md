# Güvenlik denetimi (kalite-merkezi)

Bütün uçlar `uc({...})` ile tanımlı; oturum ve işlem yetkisi çekirdekte denetlenir. Zaman (`degisti`) ve kişi (`degistiren_id`)
sunucudan yazılır. İşlemler hiçbir role verilmedi (Aşama 1): yalnız yönetici.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /kalite-merkezi/degisiklikler` | `kalite-merkezi.oku` | sürümden sonraki kayıtlar, sürüm sırasıyla | "değişiklik akışı: ..." | "yetki: ... işlemi olmayan rol iki uçtan da 403 alır" |
| `POST /kalite-merkezi/kayitlar/:koleksiyon/:kimlik/yaz` | `kalite-merkezi.yaz` | koleksiyon listesi, kimlik biçimi, gövde nesne (şema ve kısıt); dolu iz kaydının üstüne yazılmaz (servis + tetikleyici); yazma kilidiyle sürüm sırası; beklenen sürüm zorunlu, arada yazılmış ya da silinmiş kayıt 409 (#1323); muayenede yeni ölçümün cihazı kalibrasyonu geçerli olmalı (KM-K85) | "değişiklik akışı: ...", "eşzamanlı yazmalar: ...", "beklenen sürüm: ...", "KM-K85 geçersiz cihaz: ... geçerli cihaz ve eski ölçüm yazılır" | "değişiklik izi: ... ikinci yazım 409", "biçim: ... 400", "yetki: ... 403", "KM-K85 geçersiz cihaz: ... yeni ölçüm 400" |
| `POST /kalite-merkezi/kayitlar/:koleksiyon/:kimlik/sil` | `kalite-merkezi.yaz` | iz kaydı silinmez (servis + tetikleyici); silinen satır gövdesiz kalır; beklenen sürüm zorunlu (#1323) | "değişiklik akışı: ... silinen gövdesiz gelir" | "değişiklik izi: ... silme 403", "beklenen sürüm: ..." |
| `POST /kalite-merkezi/geri-yukle` | `kalite-merkezi.geri-yukle` | ayrı işlem; yedekte olmayan iz dışı kayıtlar yalnız son parçada ve başlangıç sürümüne kadar silinir; yedekteki iz alınmaz | "geri yükleme: ..." | "geri yükleme: ayrı işlem ister ..." |
| `POST /kalite-merkezi/dosyalar/:kimlik/bagla` | `kalite-merkezi.yaz` | ortak dosya deposu türleri ve 50 MB sınırı; eski bağ kaldırılır, denetim satırı yazılır | "dosya: ..." | "dosya: ... " (tür sınırı `kurallar.test.ts`) |
| `GET /kalite-merkezi/dosyalar/:kimlik` | `kalite-merkezi.oku` | yalnız bu modülün bağı | "dosya: ... ikili döner" | "dosya: ... silinince 404" |
| `POST /kalite-merkezi/dosyalar/:kimlik/sil` | `kalite-merkezi.yaz` | yalnız bu modülün bağı kaldırılır | "dosya: ... silinince 404" | "yetki: ..." |

## Sunucuda olmayan, yalnız ekranda kalan kurallar
- Kayıt içeriği yorumlanmaz: zorunlu alan, durum geçişi, NCR/DÖF/muayene kuralları uygulamadadır (Arkon kalıbı).
- Koleksiyon başına yetki yok: `kalite-merkezi.yaz` olan her kullanıcı `kullanici` ve `settings` kayıtlarına yazar.
- Uygulamanın kendi kullanıcı/PIN girişi, "tümünü sil" ve "geri yükle" açık (kullanıcı kararı 12.10.2026, madde 3 "kalsın");
  PIN özetleri okuma akışında gider (UYUM-BORCU "Kullanıma açmadan önce").
- Tekrar koruması (istek kimliği) yok: yazma kimlikle üzerine yazar.
- Sürüm denetimi (#1323): sunucu beklenen sürümü zorunlu ister. Uygulama sürüm tutmaz; beklenen sürümü köprü gönderir (akışta gördüğü son sürüm). Formun açıldığı hâlden sonra akışla gelen değişikliği köprü, uygulamanın `guncelleme` alanıyla yakalar: bu denetim tarayıcıdadır, sunucuda değil.
