# GUVENLIK-DENETIMI: akis (kart #1338)

Modül yalnız okur; yazma ucu, tablo ve göç yoktur. Dört uç `uclar.ts`'te `uc({...})` ile tanımlı; GET salt okunur tek görüntüde koşar.
Başka modülün verisi yalnız sahiplerinin `disari.ts` fonksiyonlarıyla okunur; veri kapsamı (iş merkezi) süzgeci uygulanmaz (aşağıda).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /akis/emirler` | `sayfa.akis` | yalnız okuma; arşiv dışı iş emirli emirler | AKS-U1 (yönetici 200) | AKS-U1 (operatör 403) |
| `GET /akis/emirler/:id` | `sayfa.akis` | yalnız okuma; olmayan emir 404 | AKS-U1, AKS-U2 | AKS-U1 (operatör 403, 404) |
| `GET /akis/refakat-kartlari` | `sayfa.akis` ya da `akis.kart-oku` (1870) | yalnız okuma; en çok 50 kart, olmayan kart listede yok | AKS-U3 (yönetici, depo 200) | AKS-U3 (operatör 403, 51 kart 400) |
| `GET /akis/refakat-kartlari/:id` | `sayfa.akis` ya da `akis.kart-oku` (1870) | yalnız okuma; olmayan kart 404 | AKS-U3 (yönetici, depo 200) | AKS-U3 (operatör 403, 404); depo `/akis/emirler` 403 |

Yalnız ekranda kalan kural: yok. Kullanıcı metni React ile kaçırılarak basılır.
Açık konu: iş merkezine bağlı kayıtların kapsam süzgeci (`kapsamSuzgeci`) liste ucuna uygulanmadı; sayfa yönetim ve planlama rollerine verilecek
(öneri). Kapsamlı role verilecekse bağlamada eklenir (UYUM-BORCU madde 2).
