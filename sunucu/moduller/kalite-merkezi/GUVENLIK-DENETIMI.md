# Güvenlik denetimi (kalite-merkezi)

Bütün uçlar `uc({...})` ile tanımlı; oturum ve işlem yetkisi çekirdekte denetlenir. Zaman (`degisti`) ve kişi (`degistiren_id`)
sunucudan yazılır. İşlemler hiçbir role verilmedi (Aşama 1): yalnız yönetici.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /kalite-merkezi/degisiklikler` | `kalite-merkezi.oku` | sürümden sonraki kayıtlar, sürüm sırasıyla | "değişiklik akışı: ..." | "yetki: ... işlemi olmayan rol iki uçtan da 403 alır" |
| `POST /kalite-merkezi/kayitlar/:koleksiyon/:kimlik/yaz` | `kalite-merkezi.yaz` | koleksiyon listesi, kimlik biçimi, gövde nesne (şema ve kısıt); dolu iz kaydının üstüne yazılmaz (servis + tetikleyici); yazma kilidiyle sürüm sırası; beklenen sürüm zorunlu, arada yazılmış ya da silinmiş kayıt 409 (#1323); muayenede yeni ölçümün cihazı kalibrasyonu geçerli olmalı (KM-K85) | "değişiklik akışı: ...", "eşzamanlı yazmalar: ...", "beklenen sürüm: ...", "KM-K85 geçersiz cihaz: ... geçerli cihaz ve eski ölçüm yazılır" | "değişiklik izi: ... ikinci yazım 409", "biçim: ... 400", "yetki: ... 403", "KM-K85 geçersiz cihaz: ... yeni ölçüm 400" |
| `POST /kalite-merkezi/kayitlar/:koleksiyon/:kimlik/sil` | `kalite-merkezi.yaz` + yönetici (229 a) | yalnız yönetici siler; iz kaydı silinmez (servis + tetikleyici); silinen satır gövdesiz kalır; beklenen sürüm zorunlu (#1323) | "değişiklik akışı: ... silinen gövdesiz gelir", "Soru 229 a silme: ..." | "değişiklik izi: ... silme 403", "beklenen sürüm: ...", "Soru 229 a silme: ..." |
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
- Uygulama rolü (Muayeneci, Kalite mühendisi, Kalite yöneticisi) TMI işleminden gelir, uygulamanın kullanıcı kaydından değil (195 a, B18): TMI yöneticisi
  Kalite yöneticisi, `kalite-merkezi.onayla` Kalite mühendisi, öteki Muayeneci. Ekranın rol kısıtlarının sunucudaki karşılığı onay alanları
  (form onayı, NCR ve DÖF kapanışı, MRB kararı, tedarikçi onayı) ve onay ucunun `kalite-merkezi.onayla` istemesidir (`kapama-yetkisi.test.ts`);
  229 a ile silme ve `arsiv` bayrağı yönetici, tedarikçi (`sup`) ve form şablonu (`tpl`) yazma `kalite-merkezi.onayla` ister, ayar ve kullanıcı
  kaydı yöneticidedir (`arsiv-ve-yetki.test.ts`). Kilitli kayıt yalnız `arsiv` bayrağıyla yeniden yazılabilir (228 a).
- Uygulamanın kullanıcı formu, listesi ve ekleme düğmesi kalktı (200 a); `kullanici` kayıtları rol vermez, okunmaz.
- Sürüm denetimi (#1323): sunucu beklenen sürümü zorunlu ister. Uygulama sürüm tutmaz; beklenen sürümü köprü gönderir (akışta gördüğü son sürüm). Formun açıldığı hâlden sonra akışla gelen değişikliği köprü, uygulamanın `guncelleme` alanıyla yakalar: bu denetim tarayıcıdadır, sunucuda değil.
