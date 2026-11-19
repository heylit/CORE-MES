# Güvenlik denetimi (toplantilar)

Okuma uçları `oturum` (sahiplik `kendi`): kişi düzenlediği ya da katıldığı toplantıyı görür, `toplantilar.oku` hepsini (3448-2 a).
Bütün yazma uçları `toplantilar.yaz`; rol dağılımı yapılmadı, işlem yalnız yönetici rolündedir. Testler `toplantilar.test.ts`, `uc-yetkisi.test.ts`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /toplantilar | oturum | yaklaşan/geçmiş; işlemi olmayan yalnız kendi toplantıları | katılımcı kendi toplantısını listede görür | yabancının listesinde yok |
| GET /toplantilar/:id | oturum | TOP-6 | katılımcı ve düzenleyen açar | yabancı ve çıkarılan katılımcı 403 |
| GET /toplantilar/konu-ara | toplantilar.yaz | yalnız açık kayıt, en çok 20 | uc-yetkisi | uc-yetkisi |
| POST /toplantilar | toplantilar.yaz | TOP-1, konu ve kişi FK; davet bildirimi | açılır, davet gider | tek gün dışı ve ters süre 400, olmayan proje reddedilir, katılımcı 403 |
| PUT /toplantilar/:id | toplantilar.yaz | TOP-2, sürüm; TOP-10 bildirimleri | değişir, sürüm artar | eski sürüm 409, yapılan toplantı 409 |
| POST /toplantilar/:id/iptal | toplantilar.yaz | TOP-2, neden zorunlu | iptal, katılımcıya bildirim | ikinci iptal 409 |
| POST /toplantilar/:id/yapildi | toplantilar.yaz | TOP-3 | başlamış toplantı | başlamamış 400 |
| POST /toplantilar/:id/kararlar, /aksiyonlar | toplantilar.yaz | TOP-4; karar yalnız eklenir (tetikleyici) | yazılır | iptalde 409, katılımcı 403 |
| POST /toplantilar/:id/aksiyonlar/:aksiyonId/durum | toplantilar.yaz | sürüm | bitti | uc-yetkisi |
| POST /toplantilar/:id/aksiyonlar/:aksiyonId/gorev | toplantilar.yaz | TOP-5, sürüm ve tekil dizin; proje açık olmalı | görev açılır | projesiz 409, ikinci çevirme 409 |

E-postaya gündem, karar ve aksiyon metni girmez; yalnız başlık, zaman, yer, bağlı kayıt no ve düzenleyen (ADR 0015 md 6, 3448 onay a).
