# GUVENLIK-DENETIMI: profil

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /profil` | `oturum` | yalnız oturumdaki kişinin kaydı; kişi parametresi yok; İK kartından ücret, kimlik, banka, sağlık alanı dönmez | `profil oturum ister ...`; `İK kartına bağlı kişi ...` | oturumsuz 401; başka kişinin İK kartı dönmez |
| `POST /profil/geri-bildirim-gonder` | `oturum`, tekrar korumalı | kişi ve zaman sunucudan; gövde katı (fazla alan 400); konu, tür, metin kısıtla; yalnız ekleme | `PRF: gönderilen kayıt ...` | oturumsuz 401; `kisiId` alanı, geçersiz konu/tür, kısa ve uzun metin 400; güncelleme ve silme reddedilir |
| `GET /profil/tema` | `oturum` | yalnız oturumdaki kişinin teması; kayıt yoksa tema null, sürüm 0 | `PRF-5: tema oturum ister ...` | oturumsuz 401 |
| `POST /profil/tema-sec` | `oturum`, tekrar korumalı | kişi oturumdan; gövde katı (tema, sürüm); ilk seçim sürüm 0, sonrakiler okunan sürümle; tutmayan sürüm 409 | `PRF-5: tema seçimi sürümle yazılır ...` | oturumsuz 401; `kisiId` alanı, geçersiz tema, eksi ya da eksik sürüm 400; eski sürüm ve ikinci ilk seçim 409 |
| `GET /profil/mini-pano` | `oturum` | yalnız oturumdaki kişinin seçimi; kayıt yoksa kapalı liste boş (hepsi açık), öneri kapalı, sürüm 0; panonun verisi her panonun kendi ucunda kendi yetkisiyle | `PRF-6: mini pano seçimi oturum ister ...` | oturumsuz 401 |
| `POST /profil/mini-pano-sec` | `oturum`, tekrar korumalı | kişi oturumdan; gövde katı (kapalı liste, öneri, sürüm); anahtar biçimi, tekil, en çok 50; ilk seçim sürüm 0, sonrakiler okunan sürümle; tutmayan sürüm 409 | `PRF-6: mini pano seçimi sürümle yazılır ...` | oturumsuz 401; `kisiId` alanı, biçimsiz, yinelenen ya da 51 anahtar, eksi ya da eksik sürüm 400; eski sürüm ve ikinci ilk seçim 409 |
| `GET /profil/geri-bildirimler` | `profil.geri-bildirim-oku` | sayfalı; konu, tür, durum, kategori (0 kategorisiz) süzgeci; aramada `%` ve `_` metin sayılır | yönetici, İK, müdür, GM 200; `liste süzgeci ...` | operatör ve CAM 403 |
| `GET /profil/geri-bildirimler/:id` | `profil.geri-bildirim-oku` | kayıt, takip, hareketler (iç not dahil), bağlılar; olmayan kayıt 404 | `GBM-2/3 ...` | operatör 403; olmayan 404 |
| `GET /profil/geri-bildirim-secenekleri`, `GET /profil/geri-bildirim-ozeti` | `profil.geri-bildirim-oku` | sorumlu adayları yalnız yanıtlama işlemi olanlar; özet son altı ay, tesis saat dilimiyle | `özet: durum sayıları ...` | operatör ve CAM 403 |
| `POST /profil/geri-bildirimler/:id/yanitla` | `profil.geri-bildirim-yanitla`, tekrar korumalı | kişi oturumdan; imza sunucuda rol adından (GBM-3); okunan sürümle; açık kayıt yanıtlandıya geçer (GBM-2) | `GBM-2/3 ...` | operatör 403; fazla alan, kısa metin 400; eski sürüm 409 |
| `POST /profil/geri-bildirimler/:id/not-ekle` | `profil.geri-bildirim-yanitla`, tekrar korumalı | yalnız ekleme; çalışana dönmez | `GBM-2/3 ...` (çalışan iç notu görmez) | operatör 403 |
| `POST /profil/geri-bildirimler/:id/takip-degistir` | `profil.geri-bildirim-yanitla` | satır kilitli, okunan sürümle; ilk yazım sürüm 0; pasif kategori (GBM-5), yetkisiz sorumlu ve iki kademe toplama (GBM-4) 400; durum değişimi hareket yazar | `sürüm ...`; `GBM-5 ve sorumlu ...`; `GBM-4 ...` | eski sürüm ve ikinci ilk yazım 409; geçersiz durum 400 |
| `POST /profil/geri-bildirim-kategorileri`, `.../:id/guncelle` | `profil.geri-bildirim-kategori-yaz` (ekleme tekrar korumalı) | ad harf farkıyla tekil; silme yok, pasife alma; güncelleme sürümle | `kategori: ...` | aynı ad 400, eski sürüm 409, olmayan 404 |

Sürüm denetimi çalışanın kaydında gerekmez (kayıt değişmez); takip, kategori ve tema sürümle yazılır. Çalışan kendi kaydında yalnız durumu ve yanıtları (imzayla) görür; iç notu, sorumluyu ve yanıtlayanın adını görmez. Veri kapsamı (iş merkezi) yok: kayıt iş merkezine bağlı değildir.
Yalnız ekranda kalan kural: metin uzunluğu sayacı (sunucu da reddeder). Kullanıcı metni React ile kaçırılarak basılır.
Denetim kaydı: gönderim tam gövdeyle denetim kaydına düşer (çekirdeğin varsayılanı).
