# GUVENLIK-DENETIMI: nizamiye

Testler `nizamiye.test.ts` (gerçek PostgreSQL, gerçek giriş). Oturumsuz istek çekirdekte 401. Her yazma ucu çekirdek denetim kaydına düşer.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /nizamiye/menu-sayaclari` | oturum | `nizamiye.oku` yoksa boş nesne | menü sayacı | menü sayacı (okumayana boş) |
| `GET /nizamiye/kapi`, `/gecmis`, `/acil-durum`, `/kartlar` | `nizamiye.oku` | geçmiş en çok 500 satır, arama kaçırılır | NZ-01, geçmiş, acil durum | NZ-01 (yetkisiz 403) |
| `GET /nizamiye/ev-sahipleri`, `/oneriler` | `nizamiye.yaz` | öneri en az iki harf, kimlik hanesi önerilmez | ev sahibi seçimi | ev sahibi seçimi (403) |
| `POST /nizamiye/ziyaretler/habersiz` | `nizamiye.yaz`, tekrar korumalı | NZ-01, NZ-02, NZ-03; ev sahibi etkin kişi | NZ-01 | NZ-01 (403, başlıksız istek reddi), NZ-02, NZ-03 |
| `POST /nizamiye/ziyaretler/:id/giris`, `/cikis`, `/iptal`, `/geri-al` | `nizamiye.yaz` | sürüm (409); NZ-01 - NZ-07; satır kilitli | NZ-01, NZ-04/05, NZ-06, NZ-07 | eski sürüm, NZ-02, NZ-05, NZ-06, NZ-07 süre |
| `POST /nizamiye/kartlar/:id/bildir` | `nizamiye.yaz` | NZ-10, sürüm | NZ-10 | NZ-10 |
| `GET /ziyaretcilerim` | oturum | yalnız oturumdaki kişinin ev sahibi olduğu kayıtlar; kimlik ve telefon dönmez | NZ-08 | NZ-08 (başkası görmez), NZ-09 (oturumsuz 401) |
| `POST /ziyaretcilerim/on-kayit` | oturum, tekrar korumalı | ev sahibi ve açan oturumdan, gövdedeki kişi alanı yok sayılır; NZ-09 | NZ-08, NZ-09 | NZ-09 (zaman 422, başlıksız 400) |
| `POST /ziyaretcilerim/:id/iptal` | oturum | yalnız kendi kaydı (başkasınınki 404, varlığı sızmaz); sürüm; NZ-06 | NZ-08 | NZ-08 (404, içerideyken 422) |
| `POST /nizamiye/kartlar`, `/:id/rafa-al` | `nizamiye.kart-yonet` | numara deseni ve tekil (409); NZ-10 | NZ-K1, NZ-10 | NZ-K1 (görevli 403, ikinci numara), NZ-10 (görevli 403) |

Kişisel veri: tam kimlik numarası alınmaz (166 a); ad boş bırakılabilen sütunda, saklama süresi dolunca anonimleşme Nizamiye 2'de (UYUM-BORCU).

| `POST /nizamiye/pdks/aktar` | `nizamiye.pdks-aktar` (yalnız İK, 259 a), tekrar korumalı | metin en çok 400 000 karakter; yalnız etkin kişinin sicili eşleşir; ileri zamanlı satır alınmaz; ağ bağlantısı yok (dosya tarayıcıdan) | PDKS kuralları | `PDKS dosyasını yalnız aktarma yetkilisi aktarır` (kapı görevlisi 403, 400, 422) |
| `GET/POST /nizamiye/pdks/cihazlar`, `/:id/anahtar`, `/:id/durum` | `nizamiye.pdks-aktar` | adres tek ve kurum içi, tekil (409); anahtar yalnız cevapta bir kez, scrypt özeti saklanır; tekrar korumalı değil (tekrar deposu anahtarı düz saklardı); sürüm (409) | PDKS kart okuyucu | `PDKS kart okuyucu` (görevli 403, kurum dışı 422, ikinci adres 409, eski sürüm 409) |
| `POST /nizamiye/pdks/cihaz-hareketi` | oturumsuz (289 b, ADR 0016) | ayar kapalıysa 404; `TMIV2_PDKS_CIHAZ_AGI` dışı, kayıtsız adres, yanlış anahtar, etkin olmayan cihaz 403 (aynı ileti); adres başına dakikada 60 istek ve art arda 5 hatada artan bekleme (429); gövde gizli, denetime girmez; ham gövde saklanır; cihaza yalnız sayı döner | PDKS kart okuyucu, cihaz kapısı | `PDKS kart okuyucu` (404, 403 dört yol, 429), `ag.test.ts` |
| `GET/POST /nizamiye/personel-kartlari`, `/:id/kaldir` (1326, 1327 a) | `nizamiye.pdks-aktar` | kart no gizli (denetime girmez), düz saklanmaz (sha256 özeti ve son dört hane), geri dönmez; biçim rakam ve A-F; kişi etkin olmalı; etkin kart ve kişi tekil (409); kaldırma sürümlü (409), kapalı kart 404 | `personel-kart.test.ts` | aynı dosya (kart yöneticisi 403, ikinci kart ve kişi 409, biçimsiz ve etkin olmayan kişi 400, eski sürüm 409) |
