# GUVENLIK-DENETIMI: bildirim

Bütün uçlar `oturum` ile herkese açıktır (222 a, yetki genişletme onaylı) ve yalnız oturumdaki kişinin satırına dokunur: adres ya da gövde kişi seçemez.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /bildirimler` | `oturum` | `kisi_id = oturum`; sayfalı; durum süzgeci (gelen, okunmamis, onemli, arsiv) | `olay işlem sahiplerine gider ...` | oturumsuz 401; CAM başkasının satırını görmez (`başkasının bildirimi görünmez ...`) |
| `GET /bildirimler/sayac` | `oturum` | yalnız kendi okunmamış ve arşivlenmemiş satırları | bakım 1 okunmamış, acil | oturumsuz 401; CAM 0 |
| `POST /bildirimler/:id/okundu` | `oturum` | `WHERE id AND kisi_id = oturum`; zaman sunucudan | `okundu, tümünü okundu ve arşiv ...` | oturumsuz 401; başkasının kimliği 404 ve satır değişmez |
| `POST /bildirimler/tumunu-okundu` | `oturum` | yalnız kendi satırları | bakım 1 satır işaretler | CAM'ın çağrısı bakımın satırına dokunmaz; yöneticinin satırları bakımın işaretinden etkilenmez |
| `POST /bildirimler/:id/arsivle` | `oturum` | `WHERE id AND kisi_id = oturum`; arşiv okundu da sayar (kısıt `bildirim_kaydi_arsiv_okunmus`) | arşiv listesinde görünür, gelenlerde görünmez | oturumsuz 401; başkasının kimliği 404 |
| `GET /bildirimler/tercihler` | `oturum` | yalnız kişinin alabileceği olay türleri (işlemine göre); operatörde e-posta `null` | bakım 1 satır, yönetici 4 | CAM 0 satır |
| `POST /bildirimler/tercihler/degistir` | `oturum` | gövde katı; tür kod listesinden; operatörün e-posta değeri kapalı saklanır | seçim saklanır, `varsayilan: false` | oturumsuz 401; bilinmeyen tür 400; `kisiId` alanı 400; operatör `eposta: true` gönderse de `false` saklanır |

- Sürüm denetimi yok: satırı yalnız sahibi değiştirir, iki kişinin düzenlediği kayıt değildir. Okundu ve arşiv yinelemede aynı sonucu verir (`coalesce`), tekrar koruması gerekmez.
- Veri kapsamı (iş merkezi) yok: bildirim iş merkezine bağlı kayıt değildir; açtığı kayıt kendi ekranının yetkisiyle açılır.
- Bildirim yazma uç değildir: yalnız `disari.ts` `bildirimGonder`, çağıranın transaction'ında. Alıcı gönderim anında yeniden sınanır (etkin, girişli, işlemi taşıyan).
- Yol yalnız uygulama içi adres (`kayitYoluMu` ve kısıt `bildirim_kaydi_yol_gecerli`); `//dis-site` reddedilir (test).
- Kullanıcı metni React ile kaçırılarak basılır. Denetim kaydı: yazma uçları çekirdeğin varsayılanıyla tam gövde.
- Yalnız ekranda kalan kural: yok.

## Ekip çağrısı yönlendirmesi (298 a, yetki genişletme onaylı)

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /bildirimler/cagri-yonlendirme` | `ayarlar.yaz` | ekip satırları ve rol seçenekleri | yönetici 200 | oturumsuz 401; müdür ve operatör 403 |
| `POST /bildirimler/cagri-yonlendirme/:ekip/degistir` | `ayarlar.yaz` | ekip sözleşme listesinden; gövde katı; rol var olmalı ve tekil (en çok 20); sürüm denetimi; değiştiren ve zaman sunucudan | sürüm artar, değiştiren yönetici | bilinmeyen ekip 400; `kisiId` alanı 400; olmayan ve yinelenen rol 400; eski sürüm 409 ve roller değişmez; müdür ve operatör 403 |

- Yetki genişletme (298 a): çağrı bildirimi işlemden değil rolden alıcı seçer; depo, kalite, bakım, müdür ve vardiya sorumlusu bugün görmedikleri
  çağrıyı alır. Bildirim yetki vermez ve yolsuzdur (açılan ekran yok); başlıkta yalnız ekip ve yer, metinde operatörün notu.
- Yeni işlem ve rol satırı yok: ekran ve uçlar Sistem Ayarları'nın `ayarlar.yaz` işlemini kullanır.
- `ekipCagrisiBildir` uç değildir; çağıranın transaction'ında yazar. Tetik Arkon'dadır (BASKA-MODUL-ISTEKLERI 6).
- Yalnız ekranda kalan kural: yok.

## Çağrı alıcıları okuması (Arkon isteği 8)

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /bildirimler/cagri-yonlendirme/benim` | `oturum` | yalnız oturumdaki kişi; eşlemenin rol listesini ve başka kişiyi göstermez; alıcı seçimi çağrıyla aynı | rolü yönlendirilen kişi ekiplerini görür; eşleme değişince liste değişir | oturumsuz 401; yönlendirilmeyen rol boş liste; adresteki `kisiId` kişi seçtirmez |

- VARSAYIM: yetki genişletme sayılmadı; kişi yalnız kendi alacağı çağrı ekiplerini görür, bu bilgi ona zaten bildirimle gelir. Geri alma: uç kaldırılır, düşük.

## Bildirim alıcıları (760 c, 761 b; yetki modeli değişikliği onaylı)

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /bildirimler/alicilar` | `ayarlar.yaz` | ekip çağrısı dışındaki türler, seçenek roller ve etkin girişli kişiler | yönetici 200, bütün türler | oturumsuz 401; bakım 403 |
| `POST /bildirimler/alicilar/:tur/degistir` | `ayarlar.yaz` | tür sözleşme listesinden (ekip çağrısı yok); gövde katı; rol var olmalı, kişi etkin ve girişli; tekil (en çok 20 rol, 50 kişi); sürüm denetimi, ilk yazım sürümsüz; ikisi boşsa seçim kalkar; değiştiren ve zaman sunucudan | seçim yazılır, sürüm ve değiştiren dolar | oturumsuz 401; bakım 403; ekip çağrısı ve bilinmeyen tür 400; fazla alan 400; olmayan rol ve kişi, yinelenen rol 400; eski sürüm ve ayarlı türe sürümsüz yazım 409, alıcılar değişmez |

- Yetki modeli değişikliği (760 c, 761 b): seçim yapılmış türde alıcı işlemden değil seçilen rol ve kişiden gelir; yönetici her işlemi taşısa da seçilmediyse almaz.
  Seçimsiz türde bugünkü işlem kuralı aynen geçer; göç tabloları boş açar, kurulu sistemde alıcı değişmez.
- Rol ya da kişi seçmek yetki vermez: bildirimin açtığı ekran kendi yetkisini sorar. Seçilen rol türün ekranını açamıyorsa kişi bildirimi görür ama ekranı açamaz (UYUM-BORCU 9).
- Yeni işlem ve rol satırı yok: ekran ve uçlar Sistem Ayarları'nın `ayarlar.yaz` işlemini kullanır.
- Kayda bağlı alıcı (talebi açan, istasyona atanmış kişi) çağıran modülden gelir, seçimden bağımsızdır.
- Yalnız ekranda kalan kural: yok.
