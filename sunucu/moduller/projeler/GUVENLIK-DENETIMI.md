# Güvenlik denetimi: projeler

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /projeler` | `sayfa.projeler` ya da `projeler.oku` | sayfalı, sıralama eşlemeden, arama joker kaçırılır | `yetki: ...`, `liste: ...` | `yetki: ...` (operatör 403, girişsiz 401) |
| `GET /projeler/:id` | aynı | yoksa 404 | `yetki: ...` | `yetki: ...` |
| `GET /projeler/firma-secenekleri` | `projeler.yaz` | yalnız aktif firma, en çok 20 | `PRJ-05 ...` | `yetki: ...` |
| `GET /projeler/siparis-secenekleri` | `projeler.yaz` | yalnız onaylı sipariş, en çok 20; tutar ve fiyat dönmez (no, firma adı, termin) | `PRJ-10 ...` | `PRJ-10 ...` (operatör 403) |
| `POST /projeler` | `projeler.yaz` | PRJ-01, 02, 04, 05; açan kişi ve zaman sunucudan | `PRJ-01..05` | `yetki: ...` (kayıt sayısı değişmez) |
| `POST /projeler/:id/guncelle` | `projeler.yaz` | PRJ-03 (kod gövdede yok, tetikleyici), 04, 05, 06 sürüm, 08 (siparişe bağlı projede firma ve bağ değişmez); güncelleyen ve zaman sunucudan | `PRJ-03`, `PRJ-06`, `PRJ-08` | `PRJ-06` (409, 404), `PRJ-08` (400, tetikleyici), `yetki: ...` |
| `GET /projeler/siparis/:siparisId` | `sayfa.projeler` ya da `projeler.oku` | siparişin projeleri açılış sırasıyla; olmayan siparişte boş dizi | `siparişin projeleri: ...` | `PRJ-07 yetki: ...` (operatör 403) |
| `POST /projeler/siparisten/:siparisId/ac` | `projeler.yaz` | PRJ-07 yalnız onaylı sipariş (Siparişler `disari.ts` ile okunur), firma siparişten (gövdede firma yok sayılır), PRJ-01, 02, 04, 05; açan ve zaman sunucudan | `PRJ-07 proje onaylı siparişten açılır: ...` | aynı test (taslak 400, olmayan 404), `PRJ-07 yetki: ...` (403, 401, kayıt açılmaz) |
| `GET /projeler/statuler` | `sayfa.projeler` ya da `projeler.oku` | bütün statüler (kapalılar dahil) ve serbest yazı izni | `PRJ-11 statü listesi: ...` | `yetki: ...` (operatör 403) |
| `POST /projeler/statuler` | `projeler.statu-ayar` | ad tekil (409), ton listeden; tekrar korumalı | `PRJ-11 statü listesi: ...` | `yetki: ...` (planlama 403) |
| `POST /projeler/statuler/:id/guncelle` | `projeler.statu-ayar` | sürüm (409), olmayan 404; silme yok, `etkin` kapatılır | `PRJ-11 statü listesi: ...` | aynı test (409) |
| `POST /projeler/statu-ayari/guncelle` | `projeler.statu-ayar` | tek satır, sürüm denetimli | `PRJ-11 statü listesi: ...` | `yetki: ...` |
| `GET /projeler/:id/yonetim` | `sayfa.projeler` ya da `projeler.oku` | statü, geçmiş, kilometre taşları, görevler, ilerleme; olmayan proje 404 | `PRJ-11 ...`, `PRJ-14 ...` | `yetki: ...` (operatör 403, girişsiz 401) |
| `POST /projeler/:id/statu` | `projeler.statu-yaz` | PRJ-11 (listeden etkin statü ya da izinle elle yazı); kişi ve zaman sunucudan; geçmiş yalnız eklenir (tetikleyici); tekrar korumalı | `PRJ-11 statü: ...` | aynı test (400, 422), `yetki: ...` (kalite 403) |
| `GET /projeler/sorumlu-secenekleri` | `projeler.gorev-yaz` | etkin kişilerin kimliği ve adı (Kişiler `disari.ts`) | proje ekranı testi | `yetki: ...` |
| `POST /projeler/:id/kilometre-taslari` | `projeler.gorev-yaz` | PRJ-15 açık proje (kilitli okuma); tekrar korumalı | `PRJ-13 ...` | `PRJ-15 ...` |
| `POST /projeler/kilometre-taslari/:tasId/guncelle` | `projeler.gorev-yaz` | sürüm; taban gövdede yok (tetikleyici `projeler_kilometre_tasi_taban_donuk`) | `PRJ-13 ...` | aynı test |
| `POST /projeler/kilometre-taslari/:tasId/taban-yenile` | `projeler.gorev-yaz` | PRJ-13 gerekçe zorunlu, aynı tarih reddedilir, eski değer geçmişe; sürüm | `PRJ-13 ...` | aynı test |
| `POST /projeler/:id/gorevler` | `projeler.gorev-yaz` | PRJ-12, PRJ-15; kilometre taşı ve önceki görev aynı projeden (bileşik yabancı anahtar); tekrar korumalı | `PRJ-12 ...`, `tekrar koruması: ...` | `PRJ-12 ...`, `PRJ-15 ...` |
| `POST /projeler/gorevler/:gorevId/guncelle` | `projeler.gorev-yaz` | PRJ-12 (bitti: gerçek bitiş ve %100; önceki zinciri döngüsüz), PRJ-15, sürüm | `PRJ-12 ...` | aynı test (409, 422) |

Bütçe alanı (PRJ-09) bütün okuma ve yazma uçlarında alan düzeyinde `finans.maliyet-oku` ile denetlenir: işlemi olmayana alan hiç gitmez, gövdesindeki bütçe yok sayılır, var olan değer kalır (`PRJ-09 bütçe gizliliği: ...`). `disari.ts` `projeGetir` bütçeyi de verir ve yetki denetlemez; tutarı gösteren çağıran uç `finans.maliyet-oku` ister.

Kullanıcı metni (ad, açıklama) React ile kaçırılarak basılır. Yalnız ekranda kalan kural: yok (kod alanının kilidi sunucuda da var).
Denetim kaydı: bütün yazmalar `uc()` üzerinden, tam gövdeyle.
