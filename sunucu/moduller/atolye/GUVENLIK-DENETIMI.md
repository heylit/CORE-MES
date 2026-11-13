# GUVENLIK-DENETIMI: atolye (kart #599)

Uçlar `uclar.ts`'te `uc({...})` ile. Okuma uçları `oturum` (giriş yapmış her kişi), yazma uçları beş eylemden kendi eylemini ister (3165 a: `atolye.salon-yaz`, `fabrika-yaz`, `kroki-yaz`, `model-yaz`, `kalem-yaz`; eski `atolye.yaz` hiçbir ucu açmaz); yazma tam denetime girer.
Testler: `atolye.test.ts` (gerçek PostgreSQL, gerçek giriş; geçici rolle beş eylem; `uc-yetkisi.test.ts` her ucu tek eylemle dener, `eylem-bolme.test.ts` göçü ve rol x uç eşitliğini ölçer), `kurallar.test.ts`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| 14 GET (`/atolye/salonlar`, `/:id`, `/:id/rota`, `/arama`, `/raflar/:id/gozler`, `/modeller`, model ve kroki parçaları, `/fabrika`, `/goz-kalemleri`, `/kalem-gorunumleri`) | oturum | yalnız okuma | akış testleri | kimliksiz 401 |
| `POST /atolye/salonlar` | `atolye.salon-yaz` | kod biçimi ve tekliği | salon ekleme | yetkisiz 403 |
| `POST /atolye/salonlar/:id/yerleşim-kaydet`, `/atolye/fabrika/kaydet` | `atolye.salon-yaz`, fabrika için `atolye.fabrika-yaz` | sürüm (409); ATL-01..33 yerleşim kuralları (422); salon içinde kalma, çakışma, tek istasyon yeri | ATL testleri | ATL testleri (409/422/403) |
| Model ve kroki yükleme (`/modeller`, `parca-yaz`, `tamamla`, `ayarla`, `sil`; kroki aynı) | model `atolye.model-yaz`, kroki `atolye.kroki-yaz` | parça sırası, boy, SHA-256, GLB/PDF imzası; tamamlanmış dosya değişmez; kullanılan model silinmez (ATL-25..27, 30) | model ve kroki testleri | aynı testler |
| `POST /atolye/goz-kalemleri/yaz`, `/sil`; `/kalem-gorunumleri/yaz`, `/sil` | `atolye.kalem-yaz` | gözün toplamı %100'ü aşmaz; pasif rafa kalem konmaz (ATL-28, 29) | göz kalemi testleri | aynı testler |

Yalnız ekranda kalan kural: istasyon durum rengi ve özet sayılar istemcide üretim emri cevabından çevrilir (BASKA-MODUL-ISTEKLERI 1).
Kart #1121, #1122: yeni uç yok. Harita iki var olan okuma ucunu kendi yetkisiyle çağırır (istasyonlar `GET /makine-durumlari`, üretim emirleri
`GET /uretim-emirleri/son-olaylar`); yetkisiz kişide sunucu 403 verir, ekran bunu "yetki yok" ya da arızasız harita olarak gösterir.
Kart #1122 (Arkon olayları): yeni uç yok; harita Arkon'un `GET /arkon/son-olaylar` ucunu okur (yetki ve iş merkezi kapsamı Arkon ucunda, #1160).
Kart 2902 (D5): yeni uç yok. `POST /atolye/salonlar` (atolye.yaz) bölümü açtıktan sonra aynı işlemde `bolumAcildi` olayını açan kişinin
işlemleriyle verir; stok dinleyicisi depoyu yalnız işlemlerde `stok.harita-yaz` varsa açar (atolye.salon-yaz tek başına stok deposu açtırmaz). İzinli:
yönetici açınca depo var; reddeden: planlama müdürü (atolye.salon-yaz, stok.harita-yaz yok) açınca depo yok (`bolum-olayi.test.ts`).
