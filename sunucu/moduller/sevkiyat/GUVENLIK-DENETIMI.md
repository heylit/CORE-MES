# GUVENLIK-DENETIMI: sevkiyat (kart #598)

Her uç `uclar.ts`'te `uc({...})` ile tanımlı; yazma uçları çekirdeğin tam denetimine girer (kişi ve zaman denetim kaydında).
Yetki testi: `uclar.test.ts` "her uç beklenen işlemi ister; kimliksiz 401, sayfa işlemi ya da başka işlem 403, doğru işlem geçer" bütün uçlar için
izinli ve reddeden yönü birlikte ölçer. Kural testleri `sevkiyat.test.ts` (gerçek PostgreSQL) ve `kurallar.test.ts`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /sevkiyat/noktalar`, `/araclar`, `/planlar/:tarih`, `/tek-rota`, `/harita`, `/trafik`, `/arama`, `/ozet` | `sevkiyat.oku` | yalnız okuma | yetki testi; uçtan uca | yetki testi (401, 403) |
| `POST /sevkiyat/noktalar/ekle`, `/:id/guncelle` | `sevkiyat.tanim-yaz` | tek aktif fabrika; ad tekliği; durak süresi 0-240; işteki nokta fabrika olmaz; onaylı plandaki nokta değişmez | aktif fabrika; ad tekliği | aynı testler (409/422); açık soru 12 |
| `POST /sevkiyat/noktalar/:id/pasiflestir` | `sevkiyat.tanim-yaz` | aktif fabrika pasifleşmez; onaylı plandaki nokta pasifleşmez | açık soru 8 | açık soru 8, 12 |
| `POST /sevkiyat/araclar/ekle`, `/:id/guncelle`, `/:id/pasiflestir` | `sevkiyat.tanim-yaz` | ad ve plaka tekliği; müsaitlik; onaylı plandaki araç değişmez | ad tekliği; müsaitlik | aynı testler; açık soru 12 |
| `POST /sevkiyat/isler/ekle`, `/:id/guncelle`, `/:id/iptal-et` | `sevkiyat.is-yaz` | fabrika iş noktası olmaz; tür-nokta uyumu; yük; onaylı plandaki iş değişmez | iş kuralları | aynı testler; onaylıda değişiklik reddi |
| `GET /sevkiyat/bekleyenler` | `sevkiyat.oku` | yalnız okuma | bekleyen.test.ts | operatör 403 |
| `GET /sevkiyat/urun-sevkleri` (kart #96) | `sevkiyat.oku` | yalnız okuma; emir ya da kart verilir, ikisi birden ya da hiçbiri 400; en çok 50 satır | planlama 200, işe çevrilmemiş ve havuzdaki iş, tamamlanan düşer (bekleyen.test.ts) | operatör 403; parametresiz ve iki parametreli 400 |
| `POST /sevkiyat/bekleyenler/:id/ise-cevir`, `/:id/kaldir` | `sevkiyat.is-yaz` | kayıt kilitlenir; kapalı kayıt 409; iş kuralları `isler/ekle` ile aynı; kaldıran kişi yazılır | depo 200 | operatör 403; ikinci çevirme 409; 404 |
| `POST /sevkiyat/isler/:id/durum` | `sevkiyat.is-yaz` | yalnız izinli geçişler; başka plana alınmış işin sonucu geri alınmaz | havuz | havuz; onaylı planda yalnız sonuç |
| `POST /sevkiyat/planlar/:tarih/dagit`, `/yerlestir`, `/kaydet` | `sevkiyat.plan-yaz` | sürüm (409); onaylı plan kilitli; uç yerleşimi; eşzamanlı ilk kayıt | gün planı | sürüm; eşzamanlı ilk kayıt |
| `POST /sevkiyat/planlar/:tarih/onayla`, `/onayi-kaldir` | `sevkiyat.onayla` | sürüm; onay koşulları; sonuç girilmiş planın onayı kalkmaz | gün planı | pasif noktalı iş; yol ağı yok |

Yalnız ekranda kalan kural: yok (DOĞRULANDI: NOTLAR.md "Ekran kural hesaplamaz").
Eksikler (UYUM-BORCU'nda): istek kimliğiyle tekrar koruması kullanılmıyor; onay ve sonuç kaydında kişi sütunu yok (yalnız denetim kaydında).

Tekrar koruması (kart #1323): `noktalar/ekle`, `araclar/ekle`, `isler/ekle`, `isler/:id/iptal-et`, `isler/:id/durum`, `planlar/:tarih/onayla`, `/onayi-kaldir`, `bekleyenler/:id/ise-cevir`, `/kaldir` istek kimliği başlığı ister; aynı kimlikle yineleme ikinci kayıt açmaz (`uclar.test.ts`), başlıksız istek 400.

Sürüm (kart #1323): `noktalar/:id/guncelle`, `araclar/:id/guncelle`, `isler/:id/guncelle` formun açıldığı `surum` ile gelir; arada değişen kayıtta 409 "Bu kaydı siz açtıktan sonra başkası değiştirdi; yenileyip yeniden girin." Koşullu yazma denetimle yazma arasındaki yarışı da yakalar (`sevkiyat.test.ts`, sürüm testi).
