# GUVENLIK-DENETIMI: malzeme-izi (kart 1296)

Modül yalnız okur; yazma ucu, tablo ve göç yoktur (1277 a). İki uç `uclar.ts`'te `uc({...})` ile tanımlı. Başka modülün verisi yalnız
sahiplerinin `disari.ts` işlevleriyle okunur (malzemeler, stok, satin-alma, kalite-merkezi).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /malzeme-izi/malzemeler` | `sayfa.malzeme-izi` | yalnız stoklanan türler (hizmet yok); sayfa boyu 50 | MIZ-U2 | MIZ-U1 (depo 403) |
| `GET /malzeme-izi/malzemeler/:id` | `sayfa.malzeme-izi` | olmayan ve hizmet kartı 404; fiyat yalnız `finans.oku` ile, yoksa fiyat sorgusu atılmaz | MIZ-U1, MIZ-U3 | MIZ-U1 (depo 403), MIZ-U2 (404), MIZ-U3 (para null) |

Yalnız ekranda kalan kural: yok. Kullanıcı metni React ile kaçırılarak basılır.
Açık konu: sayfa işlemi Aşama 1'de yalnız yöneticidedir; hangi rollere verileceği bağlamada sorulur (UYUM-BORCU madde 3).
