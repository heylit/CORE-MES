# GUVENLIK-DENETIMI: takimhane (kart 3613, Dilim 1-2)

Her uç `uclar.ts`'te `uc({...})` ile. Testler `takimhane.test.ts` (gerçek PostgreSQL) ve `kurallar.test.ts`; "Test" sütunundaki adlar test başlığının başıdır.
Yeni veri işlemi yoktur: yazma uçları Stok'un var olan işlemleriyle korunur, okuma uçları `sayfa.takimhane` ister. Oturumsuz istek her uçta 401 (çekirdek).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /takimhane/ozet` | `biri: sayfa.takimhane` | konum toplamı yoksa null, eşiksiz ayrı sayılır | "takım listesi konuma göre dağılır" | rol taraması (yetki-matrisi testi: yalnız altı rol sayfayı alır) |
| `GET /takimhane/takimlar` | `biri: sayfa.takimhane` | yalnız `TKM` kodlu aktif sarf/demirbaş kart | "takım listesi konuma göre dağılır" | aynı; takım olmayan kart çıkmaz (aynı test) |
| `POST /takimhane/takimlar/:kart/ozellik` | `stok.malzeme-ayari` | kart takım kartı olmalı; sınıf, çap, grup, izleme kısıtlı; tekrar korumalı | "özellik yazılır ve tekrar yazılınca güncellenir" | "olmayan takım kartı bulunamaz" (404) |
| `GET /takimhane/teslimdekiler` | `biri: sayfa.takimhane` | kişi ve istasyon konumundaki bakiye | "K3: kişiye çıkış ... kişide görünür" | rol taraması |
| `GET /takimhane/secenekler` | `takimhane.cikis-iade` | kişi, aktif istasyon, açık emir listesi | çıkış testlerinin kurulumu | rol taraması |
| `POST /takimhane/cikis` | `takimhane.cikis-iade` | raf konumu şart; kişi ya da istasyondan biri; yolda açılır; tekrar korumalı | "K3", "K2" | "K3": gönderen ve başka kişi teslimi alamaz (403) |
| `POST /takimhane/iade` | `takimhane.cikis-iade` | durum hedefi belirler (sağlam raf, aşınmış ara alan, kırık hurda); kırık nedensiz olmaz (kısıt + kural); konumdan fazlası olmaz | "iade: durum hedefi belirler ..." | aynı test (400) |
| `GET /takimhane/emirler/:id/takimlar` | `biri: sayfa.takimhane` | açık emir; eksik = adet - raf - tezgâh | "emir takım listesi ..." | aynı |
| `POST /takimhane/emirler/:id/takimlar` | `takimhane.cikis-iade` | liste tümden yazılır; aynı cep ve takım iki kez olmaz; yalnız takım kartı; tekrar korumalı | "emir takım listesi ..." | aynı (400) |
| `POST /takimhane/baslangic/onizleme` | `stok.giris` | yalnız ön izleme, hiçbir şey yazılmaz; aynı kod toplanmaz | "başlangıç stoğu ön izlemesi" | rol taraması |

## Risk koşulları (3613 Risk raporu)
- K1 kişideki takım stok önerisine girmez: `ONERI_DISI`'na `kisi` eklendi (`stok/takim-kurallari.test.ts`, `tahsis-degismezi.test.ts`).
- K2 CNC takım değişimi önce istasyon konumundan düşer: `cncTakimCikisi` (`takimhane.test.ts` "K2", `cnc-takim.test.ts`).
- K3 kişiye giden teslimi yalnız o kişi alır: `teslimAlmaEngeli` ve `teslimAlaniDenetle` kişi dalı ("K3").

## Uç katmanından geçmeyen okuma
`disari.ts` yalnız `takimKoduMu` verir. Bakiye Stok'tadır; Takımhane Stok'a yalnız `stok/disari.ts` ile erişir.

## Denetim kaydı
Yazma uçları Stok'un teslim ve hareket kaydını yazar; özellik ve emir listesi yazımı kendi uç denetimine düşer.

## Yalnız ekranda kalan kurallar
- Düğmelerin kapalı sebebi (takım seç, alan seç, kırık için neden) yalnız ekrandadır; sunucu aynı kuralları 400 ile reddeder.
- İkinci menü maddeleri yalnız görünürlüktür; `sayfa.takimhane` rol satırı göçtedir (varsayım: matristeki altı rol, onay bekliyor).

## Açık konular
- Emir takım listesinin ekranda düzenlenmesi yok (uç var); CNC kurulumdan otomatik doldurma sonraki iş.
- Başlangıç stoğunun yazımı (katalog kartı açma ve rafa giriş) yok; yalnız ön izleme.
