# GUVENLIK-DENETIMI: ortak-dosyalar (kart 2067)

Her uç `uclar.ts`'te `uc({...})` ile. SAYFA = `{ biri: ['sayfa.ortak-dosyalar'] }`. Yazma uçları tam denetimli (çekirdek varsayılanı).
Yazma hakkı işlem değil klasör düzeyidir (ADR 0030, 2-3): her uçta servis, oturumdaki kişinin rollerini (`kisiler/disari.ts` `kisininRolleri`)
ve bütün ağacı veritabanından okuyup düzeyi çözer. Görünmeyen klasör ve içindeki dosya 404 (varlık sızdırılmaz); görünür ama düzeyi yetmeyen 403.

| Uç | İşlem | Sunucudaki kurallar | Test |
|---|---|---|---|
| `GET /ortak-dosyalar/klasorler` | SAYFA | yalnız görünen klasörler; düzey her satırda; arşiv sayısı yalnız yönetilen klasörlerden | OD-2/5, OD-14 |
| `GET /ortak-dosyalar/klasorler/:klasorId/dosyalar` | SAYFA | gorur; görünmeyen 404; alt klasörler yalnız görünenler | OD-2/5 |
| `GET /ortak-dosyalar/klasorler/:klasorId/gecmis` | SAYFA | gorur; görünmeyen 404 | OD-16, OD-2/5 |
| `GET /ortak-dosyalar/son-eklenenler` | SAYFA | yalnız görünen klasörler, en çok 20 | OD-15 |
| `GET /ortak-dosyalar/arsiv` | SAYFA | yalnız yonetir olduğu klasörler | OD-12 |
| `GET .../dosyalar/:dosyaId/surumler` | SAYFA | gorur; dosya bu klasörün değilse 404; arşivde 404 | OD-11 |
| `GET .../dosyalar/:dosyaId/surumler/:sira/dosya` | SAYFA | gorur; arşivde 404; içerik yalnız bu sürümün bağından (`dosyaAkisi`); indirme denetim kaydına | OD-11, OD-12, OD-16 |
| `POST /ortak-dosyalar/klasorler` | SAYFA; tekrar korumalı | kök yalnız yönetici, özel yetkiyle ve satırsız; alt için üstte yonetir; aynı ebeveynde aynı ad 409 | OD-9, OD-10 |
| `POST /ortak-dosyalar/klasorler/:klasorId/yukle` | SAYFA; tekrar korumalı | ekler; içeriği kendisi yüklemiş olmalı (dosya modülü); tür ve 200 MB bağ sınırı; aynı ad yeni sürüm; denetim eki | OD-11, OD-7 |
| `POST .../dosyalar/:dosyaId/arsivle`, `/arsivden-cikar` | SAYFA | yonetir; sürüm; aynı durumda 409; geri almada aynı adlı etkin dosya 409 | OD-12 |
| `GET /ortak-dosyalar/klasorler/:klasorId/yetki` | `ortak-dosyalar.yetki-ver` | yalnız yönetici rolünde (bayraklı rol bütün işlemleri alır); görünmeyen 404 | OD-13 |
| `POST /ortak-dosyalar/klasorler/:klasorId/yetki` | `ortak-dosyalar.yetki-ver` | sürüm; kök özel kalır; yönetici rolüne satır yazılmaz; bilinmeyen rol 400; mirasa dönünce satırlar silinir | OD-13, OD-14 |

## Yalnız ekranda kalan
- Düğmelerin gizlenmesi ya da pasifliği (yükle, alt klasör, arşiv, Yetkiler sekmesi). Sunucu her komutta yeniden denetler.

## Kayda bağlı klasörler (kart 3288; ADR 0030 eki)
YETKI = `ortak-dosyalar.yetki-ver` (yalnız yönetici rolü; Risk K4 a: yeni işlem yok).

| Uç | İşlem | Sunucudaki kurallar | Test |
|---|---|---|---|
| `GET /ortak-dosyalar/kayit/:tur/:id` | SAYFA | klasör kişiye görünmüyorsa ya da yoksa 404 | KK-10 |
| `GET /ortak-dosyalar/ayarlar` | YETKI | açılamayan satırının etiketi kayıttan (veritabanında) | KK-8, KK-9 |
| `POST /ortak-dosyalar/ayarlar/kok-ac` | YETKI; tekrar korumalı | bir kez; aynı adlı kökte 409; düzeyler 2067-5 a | KK-9 |
| `POST /ortak-dosyalar/ayarlar/sablon` | YETKI | ad şeması, tekil | KK-6 |
| `POST /ortak-dosyalar/ayarlar/acilamayan/:tur/:id/yeniden-dene` | YETKI | yalnız listedeki satır; yoksa 404 | KK-8 |
| `GET /ortak-dosyalar/ayarlar/mevcut` | YETKI | yalnız sayı | KK-11 |
| `POST /ortak-dosyalar/ayarlar/mevcut/ac` | YETKI; tekrar korumalı | kök şart; onaylanan sayı değişmişse 409; grup 100; toplu iş kimliği | KK-11 |
| `POST /ortak-dosyalar/ayarlar/toplu/:topluIs/arsivle`, `/arsivden-cikar` | YETKI | yalnız o toplu işin klasörleri; dosyalı klasör atlanır; yoksa 404 | KK-11 |

- Sistem yazması (olay dinleyicisi, dilim 2) klasör düzeyine takılmaz: kaydın kendi ucu yetkiyi denetlemiştir. Olusturan kişi kaydı açandır.
- Günlüğe kayıt adı yazılmaz; ad yalnız veritabanında (klasör adı, açılamayan satırının zinciri).

## Kart 3443
| Uç | Yetki | Sunucu denetimi | Test |
|---|---|---|---|
| `GET /ortak-dosyalar/secim/musteriler`, `/secim/projeler` | SAYFA | yalnız müşteri ve ikisi türü etkin firma; ad ve kod listelenir (VARSAYIM, Risk bakışında) | OD-30 |
| `POST .../dosyalar/:dosyaId/kalici-sil` | SAYFA + klasörde Yönetir | arşivde, sürüm, ad; dört göz açıkken ya da açık istek varken 409 | OD-34 |
| `POST .../silme-iste` | SAYFA + Yönetir | dört göz kapalıysa 409; dosya başına tek açık istek | OD-36 |
| `POST .../silme-onayla`, `/silme-reddet` | SAYFA + Yönetir | isteyen değil (403); onayda sürüm ve ad | OD-36 |
| `POST .../silme-geri-cek` | SAYFA + Yönetir | yalnız isteyen | OD-36 |
| Ayar `ortak-dosyalar.silme-dort-goz` | `ayarlar.yaz` (genel uç; Sistem Ayarları > Onay kuralları) | denetime yazılır | OD-36 |

- Silme yazıları satır kilidi altında; kilitli satırda arşiv ve sürüm yeniden denetlenir. Defter satırı ve denetim kaydı silinmez.
