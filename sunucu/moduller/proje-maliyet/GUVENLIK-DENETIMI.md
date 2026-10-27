# Güvenlik denetimi (proje-maliyet)

Defteri sunucu işi yazar (236 a), yalnız ekleme; zaman sunucudan, donduran boş. Ekranın yazma uçları yalnız taban ve masraf bağıdır (940 c). Testler `proje-maliyet.test.ts`, `taban-masraf.test.ts`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /proje-maliyet/masraf-secenekleri | projeler.yaz | iptal dışı, satın almaya bağlı olmayan, proje masrafı türündeki ve bağlanmamış gider belgeleri, en çok 20; tutar yalnız `finans.maliyet-oku` olana (FNS-48, 260 a kalıbı) | 940 c yetki | kalite 403 |
| POST /proje-maliyet/:projeId/taban | projeler.yaz | PM-40; tekrar korumalı; cevap tutar taşımaz | PM-40, tekrar koruması | emirsiz 422, gerekçesiz yenileme 422, kalite 403, girişsiz 401 |
| POST /proje-maliyet/:projeId/masraflar | projeler.yaz | PM-41; tekrar korumalı; kişi ve zaman sunucudan | PM-41 | iptal ve faiz 422, başka projede 409, başka projenin görevi 409, olmayan belge ve proje 404, kalite 403 |
| POST /proje-maliyet/masraflar/:bagId/kaldir | projeler.yaz | bağ silinir (belge finansta kalır); olmayan 404; denetim kaydı uçtan | PM-41 | olmayan 404 |
| GET /proje-maliyet/:projeId | finans.maliyet-oku | tutar, gelir, katkı, sapma, kâr riski, ceza ve sapan iş emirleri yalnız `siparisler.fiyat-oku` ile | yönetici okur (PM-13); fiyat yetkilisi tutarı görür (PM-14) | operatör 403, girişsiz 401, olmayan proje 404, sayı olmayan kimlik 400; fiyat yetkisi olmayana tutarlar null (PM-14) |

Okuma ucunun gövdesi yok. Taban ve masraf bağlama istek kimliği ister; bağ kaldırma tekrarında ikincisi 404 alır, ikinci kez silmez.

PM-14 bugün servis düzeyinde sınanır: `siparisler.fiyat-oku` Çekirdek'in göçüyle gelince gerçek girişle sınanacak (UYUM-BORCU PM-B5).
Proje kapsamı (iş merkezi) yok: proje iş merkezine bağlı değildir.
