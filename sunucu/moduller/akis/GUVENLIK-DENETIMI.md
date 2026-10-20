# GUVENLIK-DENETIMI: akis (kart #1338)

Modül yalnız okur; yazma ucu, tablo ve göç yoktur. İki uç `uclar.ts`'te `uc({...})` ile tanımlı; GET salt okunur tek görüntüde koşar.
Başka modülün verisi yalnız sahiplerinin `disari.ts` fonksiyonlarıyla okunur; veri kapsamı (iş merkezi) süzgeci uygulanmaz (aşağıda).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /akis/emirler` | `sayfa.akis` | yalnız okuma; arşiv dışı iş emirli emirler | AKS-U1 (yönetici 200) | AKS-U1 (operatör 403) |
| `GET /akis/emirler/:id` | `sayfa.akis` | yalnız okuma; olmayan emir 404 | AKS-U1, AKS-U2 | AKS-U1 (operatör 403, 404) |

Yalnız ekranda kalan kural: yok. Kullanıcı metni React ile kaçırılarak basılır.
Açık konu: iş merkezine bağlı kayıtların kapsam süzgeci (`kapsamSuzgeci`) liste ucuna uygulanmadı; sayfa yönetim ve planlama rollerine verilecek
(öneri). Kapsamlı role verilecekse bağlamada eklenir (UYUM-BORCU madde 2).
