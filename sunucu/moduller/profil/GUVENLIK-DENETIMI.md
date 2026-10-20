# GUVENLIK-DENETIMI: profil

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /profil` | `oturum` | yalnız oturumdaki kişinin kaydı; kişi parametresi yok; İK kartından ücret, kimlik, banka, sağlık alanı dönmez | `profil oturum ister ...`; `İK kartına bağlı kişi ...` | oturumsuz 401; başka kişinin İK kartı dönmez |
| `POST /profil/geri-bildirim-gonder` | `oturum`, tekrar korumalı | kişi ve zaman sunucudan; gövde katı (fazla alan 400); konu, tür, metin kısıtla; yalnız ekleme | `PRF: gönderilen kayıt ...` | oturumsuz 401; `kisiId` alanı, geçersiz konu/tür, kısa ve uzun metin 400; güncelleme ve silme reddedilir |
| `GET /profil/geri-bildirimler` | `profil.geri-bildirim-oku` | sayfalı; konu ve tür süzgeci | yönetici 200 | operatör ve CAM 403 |

Sürüm denetimi gerekmez: kayıt değişmez. Veri kapsamı (iş merkezi) yok: kayıt iş merkezine bağlı değildir.
Yalnız ekranda kalan kural: metin uzunluğu sayacı (sunucu da reddeder). Kullanıcı metni React ile kaçırılarak basılır.
Denetim kaydı: gönderim tam gövdeyle denetim kaydına düşer (çekirdeğin varsayılanı).
