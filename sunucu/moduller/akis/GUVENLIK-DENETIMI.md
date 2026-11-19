# GUVENLIK-DENETIMI: akis (kart #1338)

Modül yalnız okur; yazma ucu, tablo ve göç yoktur. Altı uç `uclar.ts`'te `uc({...})` ile tanımlı; GET salt okunur tek görüntüde koşar.
Başka modülün verisi yalnız sahiplerinin `disari.ts` fonksiyonlarıyla okunur; veri kapsamı (iş merkezi) süzgeci uygulanmaz (aşağıda).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /akis/emirler` | `sayfa.akis` | yalnız okuma; arşiv dışı iş emirli emirler | AKS-U1 (yönetici 200) | AKS-U1 (operatör 403) |
| `GET /akis/emirler/:id` | `sayfa.akis` | yalnız okuma; olmayan emir 404 | AKS-U1, AKS-U2 | AKS-U1 (operatör 403, 404) |
| `GET /akis/refakat-kartlari` | `sayfa.akis` ya da `akis.kart-oku` (1870) | yalnız okuma; en çok 50 kart, olmayan kart listede yok | AKS-U3 (yönetici, depo 200) | AKS-U3 (operatör 403, 51 kart 400) |
| `GET /akis/refakat-kartlari/:id` | `sayfa.akis` ya da `akis.kart-oku` (1870) | yalnız okuma; olmayan kart 404 | AKS-U3 (yönetici, depo 200) | AKS-U3 (operatör 403, 404); depo `/akis/emirler` 403 |
| `GET /akis/siparisler/:id` | `siparisler.oku` (3429-1) | yalnız okuma; fiyat yok, fatura yalnız durumuyla; termin riski yalnız gün sayısı (3429-2 D); olmayan sipariş 404 | SPA-U1 (müdür 200) | SPA-U1 (cam 403, 404) |
| `GET /akis/siparis-asamalari` | `siparisler.oku` (3429-1) | yalnız okuma; en çok 100 kimlik, olmayan sipariş listede yok, bozuk liste 400 | SPA-U1 | SPA-U1 (cam 403, 400) |

Yalnız ekranda kalan kural: yok. Kullanıcı metni React ile kaçırılarak basılır.
Açık konu: iş merkezine bağlı kayıtların kapsam süzgeci (`kapsamSuzgeci`) liste ucuna uygulanmadı; sayfa yönetim ve planlama rollerine verilecek
(öneri). Kapsamlı role verilecekse bağlamada eklenir (UYUM-BORCU madde 2).
