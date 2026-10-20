# Finans kayıt formları tarayıcıda, R8 öncesi (kart #246, 09.10.2026)

Headless Chromium, `http://127.0.0.1:4101/finans`, geliştirme veritabanı, ana dal 6e04d3e (+ ciro düzeltmesi, PR #376). Her adımda çerçevenin içinde formun gerçek gönder düğmesine tıklandı; kabuğun sunucuya yaptığı yazma istekleri ağdan (CDP Network) kaydedildi. Firma, tutar ve adlar uydurmadır.

## 1. Kalan formlar (yönetici) — `kalan-formlar.mjs`, `yonetici/`

| Adım | Form | Sonuç |
|---|---|---|
| 00 | firma (ikisi) | firmalar/ekle 200 |
| 01, 02, 04 | alış ve iki satış faturası (flowForm) | belgeler/ekle 200 |
| 03 | tahsilat | odemeler/ekle 200 |
| 05 | avans dağıtımı (çekmece) | odemeler/:id/dagit 200 |
| 06 | ödeme | odemeler/ekle 200 |
| 07 | mahsup (çekmece) | mahsuplar/ekle 200 |
| 08, 10, 12 | verilen çek, iki alınan çek | cekler/ekle 200 |
| 09 | verilen çek ödendi (çekmece) | cekler/:id/odendi 200 |
| 11 | çek ciro (çekmece) | İLK KOŞU 400 "Bu komut istek kimliği ister."; düzeltmeyle 200 (aşağıda) |
| 13 | alınan çek tahsil (çekmece) | cekler/:id/tahsil 200 |
| 14 | başka ödeme (düzenli ödemeler akışı) | belgeler/ekle 200 |
| 15 | virman (çekmece) | virmanlar/ekle 200 |
| 16 | bakiye eşitleme | hesaplar/:id/esitle 200 |
| 17, 18 | düzenli ödeme ekle ve "ödendi" (düğme) | duzenli-odemeler/ekle 200, duzenli-odemeler/:id/odendi 200 (ilk koşu, `sonuc-ilk-kosu.json`) |

Bulunan hata (DOĞRULANDI): köprü çek komutlarını istek kimliksiz gönderiyordu; sunucunun ciro ucu tekrar korumalı. Düzeltme PR #376 (yalnız `kopru.ts`, ekran değil); köprü testi ana dalda kırmızı, düzeltmeyle yeşil; tarayıcıda ciro 200.
Not: 18 ikinci koşularda "düğme yok" der; prototip bu ay aynı kategoride ödeme varsa düzenli ödemeyi ödenmiş sayıyor (prototipin kendi davranışı, sunucu ilgisiz).

## 2. Yönetici yerine R8 rolü — `rol-r8/`, `rol-r8-sekiz/`

Geçici rol `gecici_r8_muhasebe` (R8: sayfa.finans, finans.oku, finans.yaz, finans.yonet, finans.firma-oku, finans.firma-yaz), yönetici rolü yok. Aynı iki betik bu kişiyle koştu:
- `kalan-formlar.mjs`: 00-17 hepsi 200 (ciro dahil). 18 yukarıdaki prototip davranışıyla atlandı.
- `sekiz-form.mjs` (08.10'daki dokuz kayıt): kurulum, hesap, firma, KDV, kur, satış, belge düzeltme, alınan çek, çek düzeltme hepsi 200.
Geçici rol iş bitince silindi; kişi pasif, girişi kapalı (giriş 401). Göç yok.

## 3. Borç 12 (ekrana dokunur; onay bekliyor) — `borc12/`

Önce: Ayarlar > KDV oranları ya da Kurlar açıkken virman çekmecesinin "Aktarımı kaydet" düğmesi sayfadaki KDV/kur formuna bağlı; tıklayınca o formun boş alanı uyarı verir, virman kaydedilmez, sunucuya istek gitmez (`once-*.png`, `once-sonuc.json`).
Sonra (geçici yamayla, depoya yazılmadı): düğme çekmecenin formuna bağlı; virman kaydedildi (200), çekmece kapandı (`sonra-*.png`, `sonra-sonuc.json`).
Yama `oneri.diff`: çekmece formunun kimliği `ekForm` yerine `ekCekmece`, düğmenin `form` özniteliği ona, gönderim yakalayıcısı iki kimliği de kabul eder (3 satır, `cerceve/finans.html`). Onaydan sonra yazılırsa öteki çekmeceler (hesap, avans, mahsup, ciro, çek sonucu) aynı betikle yeniden denenir.
