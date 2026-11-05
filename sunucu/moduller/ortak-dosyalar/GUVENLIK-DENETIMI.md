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
