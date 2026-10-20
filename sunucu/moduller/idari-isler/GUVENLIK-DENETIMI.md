# Güvenlik denetimi: idari-isler

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /idari-isler/menu-sayaclari` | oturum | işlemi olmayan sayıya null | `menü sayaçları` | `menü sayaçları` (işlemsiz kişi) |
| `GET /idari-isler/bugun` | `idari-isler.oku` | IDR-10 | `IDR-10 Bugün` | `IDR-05 pano ve Bugün` (403) |
| `GET /idari-isler/talepler/pano` | `idari-isler.oku` | sütun başına en çok 200 | `IDR-05 pano ve Bugün` | `IDR-05 pano ve Bugün` (403) |
| `GET /idari-isler/taleplerim`, `/son-yerler` | `idari-isler.talep-ac` | yalnız açanın kayıtları (sorguda `acan_kisi_id`) | `IDR-05` | `IDR-05` (başkasının talebi listede yok) |
| `GET /idari-isler/kisi-secenekleri` | `idari-isler.talep-yonet` | yalnız etkin kişiler, ad ve id | `IDR-07` | `IDR-02 red` |
| `POST /idari-isler/talepler/ac` | `idari-isler.talep-ac` | tekrar korumalı; açan ve zaman sunucudan; şema sınırları | `IDR-01` | `IDR-01 red` (401, 403, 400) |
| `POST .../:id/geri-cek` | `idari-isler.talep-ac` | satır kilidi; başkasının talebi 404 (varlığı sızmaz); IDR-02; sürüm | `IDR-03` | `IDR-03` (404, 422) |
| `POST .../:id/ustlen` | `idari-isler.talep-yonet` | kilit, IDR-02, IDR-07, sürüm | `IDR-02 akış`, `IDR-07` | `IDR-02 red` (403), `IDR-07` (400), `IDR-02 akış` (409) |
| `POST .../:id/birak`, `/kapat` | `idari-isler.talep-yonet` | kilit, IDR-02, sürüm; kapatan ve zaman sunucudan | `IDR-02 akış` | `IDR-02 red` (403) |
| `POST .../:id/reddet` | `idari-isler.talep-yonet` | kilit, IDR-02, IDR-04, sürüm | `IDR-04` | `IDR-04` (400) |

Kullanıcı metni (yer, açıklama, not) ekranda React ile kaçırılarak basılır. Yalnız ekranda kalan kural: yok (düğmelerin gizlenmesi kolaylıktır, denetim sunucudadır).
Denetim kaydı: bütün yazmalar `uc()` üzerinden. Dış çağrı yok.

Periyodik kontroller (2. parça):

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /idari-isler/kontroller`, `/:id/kayitlar` | `idari-isler.oku` | etkin kalemler en çok 500; kayıt en çok 100; olmayan kalem 404 | `IDR-12`, `IDR-13 yapıldı` | `ekleme reddi` (personel 403) |
| `GET /idari-isler/firma-secenekleri` | `idari-isler.kontrol-yaz` | yalnız etkin tedarikçi, en çok 30 | `firma seçenekleri` | `ekleme reddi` (okuyan 403) |
| `POST /idari-isler/kontroller/ekle` | `idari-isler.kontrol-yaz` | tekrar korumalı; firma etkin; sıklık bütün; açan sunucudan | `IDR-12` | `ekleme reddi` (400, 403, kayıt sayısı değişmez) |
| `POST .../:id/guncelle` | `idari-isler.kontrol-yaz` | kilit, etkin kalem, sürüm | `güncelleme` | `güncelleme` (409, 404) |
| `POST .../:id/yapildi` | `idari-isler.kontrol-yaz` | kilit, etkin kalem, IDR-13, sürüm; kaydeden ve zaman sunucudan | `IDR-13 yapıldı`, `IDR-13 red` | `IDR-13 red` (400), `IDR-13 yapıldı` (409), `IDR-15` (422) |
| `POST .../:id/bitir` | `idari-isler.kontrol-yaz` | kilit, etkin kalem, sürüm | `IDR-15` | `IDR-15` (422) |

Yemek sayısı (3. parça):

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /idari-isler/yemek` | `idari-isler.oku` | gün boşsa tesis günü; geçmiş en çok 14 gün | `IDR-16`, `ileri gün` | `IDR-16` (okuyan sayaçta null) |
| `POST /idari-isler/yemek/bildir` | `idari-isler.yemek-yaz` | tekrar korumalı; kadro ve izinli sunucuda yeniden hesaplanır; IDR-17; bildiren ve zaman sunucudan | `IDR-16`, `düzeltme`, `tekrar koruması` | `IDR-17 ret` (400, okuyan 403, kayıt sayısı değişmez) |

Filo araç kartı (4. parça):

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /idari-isler/araclar` | `idari-isler.oku` | en çok 500; uyarılar sunucu gününden | `IDR-20 ekleme` | - |
| `POST /idari-isler/araclar/ekle` | `idari-isler.filo-yaz` | tekrar korumalı; IDR-20; açan sunucudan | `IDR-20 ekleme` | `ret` (400, okuyan 403, kayıt sayısı değişmez) |
| `POST .../:id/guncelle` | `idari-isler.filo-yaz` | kilit, IDR-20, IDR-21, sürüm | `IDR-21 güncelleme` | `IDR-21 güncelleme` (400, 409, 404) |

Araç görev talebi (5. parça):

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /idari-isler/arac-gorevleri` | `idari-isler.oku` | açıklar ve son 14 gün, en çok 200 | `yetki ve görünürlük` | `yetki ve görünürlük` (çalışan 403) |
| `GET /idari-isler/arac-taleplerim` | `idari-isler.arac-talebi-ac` | yalnız kendi talepleri | `yetki ve görünürlük` | `yetki ve görünürlük` (başkası boş liste) |
| `POST /idari-isler/arac-gorevleri/ac` | `idari-isler.arac-talebi-ac` | tekrar korumalı; IDR-24; talep eden sunucudan | `IDR-23 akış` | `IDR-24 ve IDR-23 ret` (400, kayıt sayısı değişmez) |
| `POST .../:id/geri-cek` | `idari-isler.arac-talebi-ac` | yalnız talep eden (başkasına 404), IDR-23, sürüm | `yetki ve görünürlük` | `yetki ve görünürlük` (404), `IDR-24 ve IDR-23 ret` (422) |
| `POST .../:id/onayla` | `idari-isler.filo-yaz` | kilit, IDR-23, IDR-25, sürüm | `IDR-23 akış`, `IDR-25` | `IDR-25` (400), `yetki ve görünürlük` (403) |
| `POST .../:id/reddet` | `idari-isler.filo-yaz` | kilit, IDR-23, neden zorunlu, sürüm | `IDR-24 ve IDR-23 ret` | `IDR-24 ve IDR-23 ret` (400), `yetki ve görünürlük` (okuyan 403) |
| `POST .../:id/cikis`, `.../:id/donus` | `idari-isler.filo-yaz` | kilit, IDR-23, IDR-26, araç km'si ve durumu aynı işlemde | `IDR-23 akış` | `IDR-23 akış` (400), `IDR-24 ve IDR-23 ret` (422) |

Araç masrafı (6. parça):

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /idari-isler/araclar/:id/masraflar` | `idari-isler.oku` | en çok 200; yıl toplamı iptalsiz, kayıt yoksa null; yok araç 404 | `IDR-27 akış` | `yetki` (çalışan 403) |
| `POST /idari-isler/araclar/:id/masraf-ekle` | `idari-isler.filo-yaz` | tekrar korumalı; IDR-27; kaydeden sunucudan | `IDR-27 akış` | `IDR-27 ret` (400, 404, kayıt sayısı değişmez), `yetki` (okuyan 403) |
| `POST /idari-isler/masraflar/:id/iptal` | `idari-isler.filo-yaz` | kilit, IDR-28, neden zorunlu, sürüm | `IDR-28` | `IDR-28` (400, 422, 409), `yetki` (okuyan 403) |

Demirbaş ve zimmet (7. parça):

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /idari-isler/demirbaslar` | `idari-isler.oku` | en çok 1000; açık zimmetle | `IDR-30 ve IDR-31 akış` | `yetki` (talep açan 403) |
| `GET /idari-isler/demirbaslar/:id/zimmetler` | `idari-isler.oku` | yok demirbaş 404 | `IDR-30 ve IDR-31 akış` | - |
| `GET /idari-isler/kisi-secenekleri` | `talep-yonet` ya da `zimmet-yaz` | yalnız etkin kişiler, ad | `yetki` | `yetki` (okuyan 403) |
| `POST /idari-isler/demirbaslar/ekle` | `idari-isler.zimmet-yaz` | tekrar korumalı; IDR-29; açan sunucudan | `IDR-30 ve IDR-31 akış` | `IDR-29, IDR-30 ve IDR-31 ret` (400), `yetki` (okuyan 403) |
| `POST .../demirbaslar/:id/guncelle` | `idari-isler.zimmet-yaz` | kilit, IDR-29, IDR-30, sürüm | `IDR-30: zimmetli ...` | `IDR-30: zimmetli ...` (422) |
| `POST .../demirbaslar/:id/zimmetle` | `idari-isler.zimmet-yaz` | kilit, IDR-30, etkin kişi, sürüm; veren sunucudan | `IDR-30 ve IDR-31 akış` | `IDR-29, IDR-30 ve IDR-31 ret` (400, 409, kayıt yazılmaz), `yetki` (403) |
| `POST /idari-isler/zimmetler/:id/iade` | `idari-isler.zimmet-yaz` | kilit, IDR-31, sürüm; alan sunucudan | `IDR-31 ...` | `IDR-31 ...` (422), `IDR-29, IDR-30 ve IDR-31 ret` (400) |
| `POST /idari-isler/zimmetler/:id/kisiye-bagla` | `idari-isler.zimmet-yaz` | kilit, yalnız kişisiz zimmet, etkin kişi, sürüm | `IDR-32: kişisiz (adla) zimmet ...` | `IDR-32: kişisiz (adla) zimmet ...` (403, 409, 422) |
