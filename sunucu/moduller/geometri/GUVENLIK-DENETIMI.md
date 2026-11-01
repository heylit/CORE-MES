# GUVENLIK-DENETIMI: geometri

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /geometri/modeller` | `geometri.oku` | yalnız malzeme kartına bağlı, yayındaki STEP/IGES; sayfalı; ara ve durum süzgeci | `G-A1`, `G-A2` | `G-A3`: işlemsiz 403, oturumsuz 401 |
| `GET /geometri/modeller/:revizyonId/dosya` | `geometri.oku` | yalnız listedeki revizyonun dosyası (başka belge bu yoldan okunamaz); Çizim Merkezi'nden akış | `G-A3` (okur 200, içerik aynı) | `G-A3`: işlemsiz 403 |
| `GET /geometri/analizler/:revizyonId` | `geometri.oku` | listede olmayan revizyon 404; analiz yalnız aynı özetteki içeriğe aitse döner | `G-A1`, `G-A3` | `G-A3` 403; `G-A4` 404 |
| `GET /geometri/ham-onerisi/:revizyonId` | `geometri.oku` | pay 0-100 mm (yoksa ayar), kalite en çok 100 karakter; analiz yoksa enAz null; hammadde kartlarından yalnız kod, ad, kalite, form, ölçü döner | `G-A1` | `G-A4`: eksi pay 400 |
| `POST /geometri/analizler/:revizyonId/yeniden-hesapla` | `geometri.hesapla`, tekrar korumalı | sürüm koşullu (iş yokken null); gövde katı; yalnız kuyruğa yazar | `G-A3`, `G-A4` | `G-A3`: okur 403, oturumsuz 401; `G-A4`: eski sürüm 409, bağsız revizyon 404 |

Rol x işlem (1445 a): Aşama 1'de yalnız yönetici; roller 1390 rol menüsüyle verilir, göç yok.
Veri kapsamı (iş merkezi) yok: malzeme kartı ve çizim iş merkezine bağlı değildir.
Güvenilmeyen girdi: STEP/IGES ayrı süreçte okunur (1427 a). Dosya 200 MB sınırı, biçim başlığı denetimi, iş başına 120 sn süre sınırı,
süreç belleği 2 GB'ı aşınca öldürülür; süreç ağa açılmaz, veritabanına bağlanmaz, ana sürecin bayraklarını (`execArgv: []`) ve ortam değişkenlerini almaz (yalnız `PATH`, `SystemRoot` ve geçici klasör değişkenleri geçer; `G-O1`, `G-O2`), ana süreç
kapanınca kendisi de kapanır. Hata metni kısaltılır (500 karakter); dosya içeriği hata metnine girmez.
Zaman ve kişi sunucudan; denetim kaydı yeniden hesaplatmada tam gövdeyle (çekirdeğin varsayılanı).
