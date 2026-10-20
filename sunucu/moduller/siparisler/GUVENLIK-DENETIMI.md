# Güvenlik denetimi: siparisler

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /siparisler` | `siparisler.oku` | sayfalı, sıralama eşlemeden, arama joker kaçırılır | `yetki`, `numara ... liste` | `yetki` (operatör 403, girişsiz 401) |
| `GET /siparisler/:id` | `siparisler.oku` | yoksa 404 | `yetki` | `yetki` |
| `POST /siparisler/ekle` | `siparisler.yaz` | tekrar korumalı; SIP-01, 02, 07, 08, 09; açan ve zaman sunucudan | `SIP-01`, `SIP-02`, `tutarlar` | `yetki` (kayıt sayısı değişmez), `SIP-01`, `SIP-02`, `SIP-07`, `SIP-08` |
| `POST /siparisler/:id/guncelle` | `siparisler.yaz` | satır kilidi, SIP-03, sürüm; güncelleyen ve zaman sunucudan | `SIP-03 ve sürüm` | `SIP-03 ve sürüm` (409, 422) |
| `POST /siparisler/:id/onayla` | `siparisler.onayla` | SIP-04, sürüm; onaylayan ve zaman sunucudan | `SIP-03 ve sürüm` | `yetki`, `SIP-04` |
| `POST /siparisler/:id/kapat` | `siparisler.onayla` | SIP-04, sürüm | `SIP-04` | `SIP-04` |
| `POST /siparisler/:id/iptal` | `siparisler.onayla` | SIP-04, neden zorunlu, sürüm | `SIP-04` | `SIP-04` (nedensiz 400, kapanmış 422) |
| `GET /siparisler/teklifler`, `/:id` | `siparisler.oku` | sayfalı, arama joker kaçırılır; yoksa 404 | `TKL` testleri | `teklif.test.ts` `yetki` |
| `POST /siparisler/teklifler/ekle` | `siparisler.yaz` | tekrar korumalı; SIP-01, SIP-02; açan ve zaman sunucudan | `SIP-01 ve SIP-02 teklifte de` | `yetki`, `SIP-01 ve SIP-02 teklifte de` |
| `POST .../:id/guncelle` | `siparisler.yaz` | kilit, TKL-03, sürüm | `TKL-03 ve TKL-04` | `TKL-03 ve TKL-04` (422) |
| `POST .../:id/surum-ver` | `siparisler.yaz` | kilit, TKL-04, TKL-05, sürüm; fiyat yalnız eklenir | `TKL-03 ve TKL-04` | `yetki`, `TKL-03 ve TKL-04` (400), `red notla` (422) |
| `POST .../:id/revizyon-iste`, `/reddet` | `siparisler.yaz` | TKL-05, not zorunlu, sürüm | `TKL-03 ve TKL-04`, `red notla` | `red notla` (400) |
| `POST .../:id/kabul` | `siparisler.yaz` | TKL-05, sürüm var mı, sürüm | `TKL-05 ve TKL-06` | `TKL-05 ve TKL-06` (422, 400), `TKL-03 ve TKL-04` (409) |
| `POST .../:id/satirlar/:satirId/kart-bagla` | `siparisler.yaz` | TKL-06, SIP-02, sürüm | `TKL-05 ve TKL-06` | `TKL-05 ve TKL-06` (400, 422) |
| `POST .../:id/siparise-donustur` | `siparisler.yaz` | tekrar korumalı; TKL-05, TKL-06, TKL-07 ve sipariş kuralları; sipariş taslak açılır | `TKL-05 ve TKL-06` | `TKL-05 ve TKL-06` (422) |

Kullanıcı metni (açıklama, ödeme koşulu, iptal nedeni) ekranda React ile kaçırılarak basılacak (ekran sonraki parça). Yalnız ekranda kalan kural: yok.
Denetim kaydı: bütün yazmalar `uc()` üzerinden, tam gövdeyle. Veri kapsamı: sipariş iş merkezine bağlı değil.
