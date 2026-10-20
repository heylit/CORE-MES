# GUVENLIK-DENETIMI: atolye (kart #599)

Uçlar `uclar.ts`'te `uc({...})` ile. Okuma uçları `oturum` (giriş yapmış her kişi), yazma uçları `atolye.yaz`; yazma tam denetime girer.
Testler: `atolye.test.ts` (gerçek PostgreSQL, gerçek giriş; geçici rolle `atolye.yaz`), `kurallar.test.ts`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| 14 GET (`/atolye/salonlar`, `/:id`, `/:id/rota`, `/arama`, `/raflar/:id/gozler`, `/modeller`, model ve kroki parçaları, `/fabrika`, `/goz-kalemleri`, `/kalem-gorunumleri`) | oturum | yalnız okuma | akış testleri | kimliksiz 401 |
| `POST /atolye/salonlar` | `atolye.yaz` | kod biçimi ve tekliği | salon ekleme | yetkisiz 403 |
| `POST /atolye/salonlar/:id/yerleşim-kaydet`, `/atolye/fabrika/kaydet` | `atolye.yaz` | sürüm (409); ATL-01..33 yerleşim kuralları (422); salon içinde kalma, çakışma, tek istasyon yeri | ATL testleri | ATL testleri (409/422/403) |
| Model ve kroki yükleme (`/modeller`, `parca-yaz`, `tamamla`, `ayarla`, `sil`; kroki aynı) | `atolye.yaz` | parça sırası, boy, SHA-256, GLB/PDF imzası; tamamlanmış dosya değişmez; kullanılan model silinmez (ATL-25..27, 30) | model ve kroki testleri | aynı testler |
| `POST /atolye/goz-kalemleri/yaz`, `/sil`; `/kalem-gorunumleri/yaz`, `/sil` | `atolye.yaz` | gözün toplamı %100'ü aşmaz; pasif rafa kalem konmaz (ATL-28, 29) | göz kalemi testleri | aynı testler |

Yalnız ekranda kalan kural: istasyon durum rengi ve özet sayılar istemcide üretim emri cevabından çevrilir (BASKA-MODUL-ISTEKLERI 1).
Kart #1121, #1122: yeni uç yok. Harita iki var olan okuma ucunu kendi yetkisiyle çağırır (istasyonlar `GET /makine-durumlari`, üretim emirleri
`GET /uretim-emirleri/son-olaylar`); yetkisiz kişide sunucu 403 verir, ekran bunu "yetki yok" ya da arızasız harita olarak gösterir.
Kart #1122 (Arkon olayları): yeni uç yok; harita Arkon'un `GET /arkon/son-olaylar` ucunu okur (yetki ve iş merkezi kapsamı Arkon ucunda, #1160).
