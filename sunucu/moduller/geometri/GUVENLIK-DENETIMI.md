# GUVENLIK-DENETIMI: geometri

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /geometri/modeller` | `geometri.oku` | yalnız malzeme kartına bağlı, yayındaki STEP/IGES; sayfalı; ara ve durum süzgeci | `G-A1`, `G-A2` | `G-A3`: işlemsiz 403, oturumsuz 401 |
| `GET /geometri/modeller/:revizyonId/dosya` | `geometri.oku` | yalnız listedeki revizyonun dosyası (başka belge bu yoldan okunamaz); Çizim Merkezi'nden akış | `G-A3` (okur 200, içerik aynı) | `G-A3`: işlemsiz 403 |
| `GET /geometri/modeller/:revizyonId/guncel` | `geometri.oku` | yalnız belge kimliği kuyruk kaydından; dönen revizyon listedeki (yayında, karta bağlı) modeldir, yoksa null | `G-A7` | `G-A7`: işlemsiz 403, oturumsuz 401 |
| `GET /geometri/analizler/:revizyonId` | `geometri.oku` | listede olmayan revizyon 404; analiz yalnız aynı özetteki içeriğe aitse döner | `G-A1`, `G-A3` | `G-A3` 403; `G-A4` 404 |
| `GET /geometri/ham-onerisi/:revizyonId` | `geometri.oku` | pay 0-100 mm (yoksa ayar), kalite en çok 100 karakter; analiz yoksa enAz null; hammadde kartlarından yalnız kod, ad, kalite, form, ölçü döner | `G-A1` | `G-A4`: eksi pay 400 |
| `GET /geometri/ozellikler/:revizyonId` | `geometri.oku` | listede olmayan revizyon 404; analiz başka içeriğe aitse ya da yüzler okunamadıysa null; yalnız tanınan özellik ölçüleri döner (dosya içeriği dönmez); yazma yok | `G-A9` (okur 200) | `G-A9`: işlemsiz 403, oturumsuz 401, bağsız revizyon 404 |
| `GET /geometri/montaj/:revizyonId` | `geometri.oku` | listede olmayan revizyon 404; analiz başka içeriğe aitse 'analiz-yok', montaj okunmadıysa 'montaj-yok'; yalnız düğüm adı, kutu ve ölçü döner (dosya içeriği dönmez); yazma yok; yalnız öneri (2109) | `GEO-MO-A1`, `GEO-MO-A2` (okur 200) | `GEO-MO-A1`: işlemsiz 403, oturumsuz 401, bağsız revizyon 404 |
| `GET /geometri/saglik/:revizyonId` | `geometri.oku` | listede olmayan revizyon 404; analiz başka içeriğe aitse 'analiz-yok', B-rep okunmadıysa 'saglik-yok'; yalnız sayılar, tolerans, birim adı ve bulgu metni döner (dosya içeriği dönmez); yazma yok; yalnız uyarı (2143) | `GEO-SA-A1`..`GEO-SA-A5` (okur 200) | `GEO-SA-A1`: işlemsiz 403, oturumsuz 401, bağsız revizyon 404, geçersiz kimlik 400 |
| `POST /geometri/analizler/:revizyonId/yeniden-hesapla` | `geometri.hesapla`, tekrar korumalı | sürüm koşullu (iş yokken null); gövde katı; yalnız kuyruğa yazar | `G-A3`, `G-A4` | `G-A3`: okur 403, oturumsuz 401; `G-A4`: eski sürüm 409, bağsız revizyon 404 |

Rol x işlem (1445 a): Aşama 1'de yalnız yönetici; roller 1390 rol menüsüyle verilir, göç yok.
Veri kapsamı (iş merkezi) yok: malzeme kartı ve çizim iş merkezine bağlı değildir.
Güvenilmeyen girdi: STEP/IGES ayrı süreçte okunur (1427 a). Dosya 200 MB sınırı, biçim başlığı denetimi, iş başına 120 sn süre sınırı,
süreç belleği 2 GB'ı aşınca öldürülür; süreç ağa açılmaz, veritabanına bağlanmaz, ana sürecin bayraklarını (`execArgv: []`) ve ortam değişkenlerini almaz (yalnız `PATH`, `SystemRoot` ve geçici klasör değişkenleri geçer; `G-O1`, `G-O2`), ana süreç
kapanınca kendisi de kapanır. Hata metni kısaltılır (500 karakter); dosya içeriği hata metnine girmez.
Montaj ağacı (2109): dosyadaki ad 200 karaktere kısaltılır, boş ad null; ağaç yığınla gezilir (derin iç içe yapı çağrı yığınını taşırmaz); 20.000 düğümü aşan model ağaç yazmaz; geçersiz ağ dizini ve bozuk alan yok sayılır (`GEO-MO4`).
Zaman ve kişi sunucudan; denetim kaydı yeniden hesaplatmada tam gövdeyle (çekirdeğin varsayılanı).
Sağlık raporu (2143): ölçüm aynı ayrı süreçte, aynı süre ve bellek sınırıyla yapılır; dosyadaki birim adı 40 karakteri aşarsa ya da boşsa null; IGES global bölümü en çok 200 satır okunur. Sağlık ölçümü düşerse analiz ve yüzler yine yazılır.
