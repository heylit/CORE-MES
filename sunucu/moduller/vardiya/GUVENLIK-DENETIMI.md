# Güvenlik denetimi (vardiya)

Her yazma ayrı uç, kendi şeması ve `vardiya.yaz` işlemiyle; kişi ve zaman sunucudan (denetim kaydı çekirdekte). Testler `vardiya.test.ts`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /vardiya-takvimi | oturum | - | operatör okur | - |
| GET /calisma-takvimi | oturum | aralık 1-366 gün, bitiş başlangıçtan sonra; kişi kaynağı VR-27 (kendisi, ik.oku, kapsamdaki arkon.amir ya da vardiya.yaz) | operatör makine ve iş merkezi okur; kişi kendini, İK, kapsamdaki amir ve planlama kişiyi okur | ters ve uzun aralık 400; başka operatör, kapsam dışı amir ve kısıtlı planlama kişide 403 |
| GET /vardiya-personeli | sayfa.vardiya ya da vardiya.yaz | kişi adı döner | planlama okur | operatör 403 |
| POST /vardiyalar | vardiya.yaz | istek kimliği; VR-05; VR-09; ad tekil | planlama açar, aynı kimlik tek kayıt | operatör 403, kimliksiz 400, çakışan mola 400, aynı ad 409, kısıtlı 403 |
| POST /vardiyalar/:id/guncelle | vardiya.yaz | sürüm; VR-05; VR-09 | okunan sürümle 200, sürüm artar | operatör 403, eski sürüm 409, olmayan 404 |
| POST /vardiya-matrisi/degistir | vardiya.yaz | iş merkezi kapsamı; yabancı anahtar | kısıtlı kendi merkezine 200 | operatör 403, kısıtlı başka merkeze 403, olmayan merkez 409 |
| POST /vardiya-matrisi/hafta-uygula | vardiya.yaz | VR-09; matris kilidi; VR-06 | planlama uygular | operatör 403, kısıtlı 403, olmayan kaynak 404 |
| POST /vardiya-matrisi/toplu-yaz | vardiya.yaz | VR-18; her merkez kapsamda (ret ayrıntısıyla); matris kilidi; yabancı anahtar; tekil liste | planlama ekler, kaldırır, ayarlar; kısıtlı kendi merkezine | operatör 403, kısıtlı listede başka merkez 403 ve hiçbiri yazılmaz, olmayan merkez 400, olmayan vardiya 409, boş vardiya ve yinelenen merkez 400 |
| POST /vardiya-matrisi/kopyala | vardiya.yaz | VR-19; her hedef kapsamda; matris kilidi | planlama seçilene kopyalar, seçilmeyen değişmez | operatör 403, kısıtlı başka merkeze 403, kaynak hedefte 400, olmayan kaynak 404 |
| POST /takvim-gunleri | vardiya.yaz | VR-09; VR-03; VR-28 yalnız kapalı gün | planlama gelecek gün, yönetici geçmiş gün | operatör 403, planlama geçmiş 403, kısıtlı 403, tatil 400 |
| POST /takvim-gunleri/:tarih/kaldir | vardiya.yaz | VR-09; VR-03; VR-28 İK tatili burada silinmez | planlama gelecek gün | planlama geçmiş 403, olmayan ve İK tatili 404 |
| POST /takvim-gunleri/temizle | vardiya.yaz | VR-09; VR-10 (yalnız Vardiya'nın kendi günleri) | yönetici hepsini siler, İK tatilleri kalır | operatör 403; planlama geçmişi silemez (kalır) |
| POST /kisi-vardiyalari/:kisiId/belirle | vardiya.yaz | kişinin iş merkezi kapsamı; yabancı anahtar | planlama yazar ve kaldırır | operatör 403, kısıtlı başka merkezdeki kişiye 403, olmayan kişi 409 |
| POST /kisi-vardiyalari/toplu-belirle | vardiya.yaz | VR-20; her kişinin iş merkezi kapsamda (ret ayrıntısıyla); yabancı anahtar | planlama yazar ve kaldırır, kısıtlı iş merkezsiz kişiye | operatör 403, kısıtlı listede başka merkezdeki kişi 403 ve hiçbiri yazılmaz, boş liste 400, olmayan kişi 409 |
| GET /planli-duruslar | oturum | sayfalı | operatör okur | - |
| POST /planli-duruslar | vardiya.durus-yaz | istek kimliği; VR-11..VR-14; yabancı anahtar | planlama açar | operatör 403, hedef ve süre hatası 400, kısıtlı tesis geneli ve başka merkez 403, plansız neden 400 |
| POST /planli-duruslar/:id/guncelle | vardiya.durus-yaz | sürüm; VR-11..VR-14; eski ve yeni yer kapsamda | okunan sürümle 200 | eski sürüm 409, kısıtlı başka merkezdeki kayda 403 |
| POST /planli-duruslar/:id/kaldir | vardiya.durus-yaz | sürüm; kapsam | okunan sürümle siler | eski sürüm 409, operatör 403 |
| GET /fazla-mesai | sayfa.vardiya ya da vardiya.yaz (kişi kimlikleri döner) | aralık en çok 366 gün, bitiş başlangıçtan önce değil | planlama okur | operatör 403, ters ve uzun aralık 400 |
| POST /fazla-mesai | vardiya.yaz | istek kimliği; VR-21..VR-23; yabancı anahtar | planlama açar, yönetici geçmişe | operatör 403, kimliksiz 400, hedef ve süre hatası 400, olmayan kişi 409, kısıtlı başka merkez ve başka merkezdeki kişi 403, planlama geçmiş tarih 403 |
| POST /fazla-mesai/:id/guncelle | vardiya.yaz | sürüm; VR-21..VR-23; eski ve yeni yer kapsamda; iptal edilen değişmez | okunan sürümle 200 | eski sürüm 409, kısıtlı başka merkezdeki kayda 403, iptal edilen 409 |
| POST /fazla-mesai/:id/iptal | vardiya.yaz | sürüm; kapsam | okunan sürümle iptal | ikinci iptal 409, kısıtlı 403, olmayan 404 |
| `disari.planliDurusYaz`, `planliDurusSilArkon` (Arkon `downs`) | vardiya.durus-yaz | VR-16; çağıranın transaction'ı | planlama yazar ve siler | operatör 403, eski Arkon sürümü çakışma |

Tekrar korumalı uçlar `POST /vardiyalar`, `POST /planli-duruslar` ve `POST /fazla-mesai` (yeni kayıt açan komutlar); öbür komutlar aynı sonucu yazar (idempotent).
Yalnız ekranda kalan kural: iki adımlı onay (haftayı uygula, temizle, toplu "Yalnız bunlar olsun", seçilenlere kopyala) ekrandadır; sunucu tek çağrıda uygular (yetki ve kapsam sunucuda).
Kullanıcı metni (vardiya ve tatil adı) React ile kaçırılarak basılır; HTML basılmaz.
