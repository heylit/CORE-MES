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
