# GUVENLIK-DENETIMI: degisiklik-yonetimi (kart 1120, P1 sunucu)

Her uç `uclar.ts`'te `uc({...})` ile, kök `/degisiklik-yonetimi`. İşlem öneki `degisiklik-yonetimi.` (1126 a); Aşama 1'de on bir işlemin hepsi yalnız yönetici bayrağıyla gelir, rol x işlem satırı yok (1122 a).
Testler `degisiklik-yonetimi.test.ts` (gerçek PostgreSQL) ve `kurallar.test.ts`; "Test" sütunundaki adlar test başlığının başıdır.
"yetki": "yetki: oturumsuz 401, işlemsiz 403; her komut yalnız kendi işlemiyle geçer; okuma işlemlerden biriyle açılır". Bu test her komutu on bir tek işlemli kullanıcıyla dener: yalnız kendi işlemi geçer (403 değil), öteki on işlem 403 alır; operatör ve oturumsuz bütün uçlarda reddedilir.
OKUMA = `{ biri: [on bir işlem] }`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /gorevlerim` | OKUMA | açana kendi CCB görevi düşmez (DY-19); hedef süre (DY-18) | listeler | yetki |
| `GET /talepler`, `GET /talepler/:id` | OKUMA | kapsam, durum, sınıf, arama (ILIKE kaçışlı) | listeler | yetki |
| `GET /parca-adaylari` | `talep-ac` | yalnız aktif mamul ve yarı mamul, en çok 50 | listeler | yetki |
| `POST /talepler/ac` | `talep-ac`; tekrar korumalı | parça var, aktif, mamul ya da yarı mamul (DY-20); kişi ve zaman sunucudan | DY-20 | yetki, DY-20 (400, aynı istek kimliği ikinci talep açmaz) |
| `POST /talepler/:id/siniflandir` | `siniflandir` | yalnız süre değişikliği talep sayılmaz (DY-1); adım sırası (DY-2); sürüm | DY-1, DY-2 | yetki, DY-1 (400), DY-2 (409) |
| `POST /talepler/:id/etki-analizi` | `siniflandir` | yalnız analizde; bilinmeyen bölüm null | DY-1, DY-2 | yetki, DY-2 |
| `POST /talepler/:id/ccb` | `ccb-karar` | açan kendi talebine veremez (DY-3, 403); D1 müşteri onayına gider (DY-5); ret talebi kapatır | DY-3, DY-5 | yetki, DY-3 |
| `POST /talepler/:id/musteri-onayi` | `musteri-onayi` | yalnız müşteri onayı bekleyen talepte; referans zorunlu | DY-3, DY-5 | yetki, DY-3 (400) |
| `POST /talepler/:id/emir-ac` | `emir-ac` | yalnız onaylı talep; kalemler talepten | D1 akışı | yetki |
| `GET /emirler`, `GET /emirler/:id` | OKUMA | kapsam, durum, sınıf, arama | listeler | yetki |
| `POST /emirler/:id/taslak-ac`, `kalem-kaydet`, `yayina-gonder` | `revizyon-hazirla` | proseste yeni parça no yok; yayına gönderimde özet, değiştirilebilirlik, gereken yeni parça no (DY-6, DY-7) | D1 akışı, P2 akışı | yetki, D1 akışı (400), P2 akışı (400) |
| `POST /emirler/:id/geri-gonder` | `yayinla` | açıklama zorunlu; yalnız yayın onayında | D1 akışı | yetki, D1 akışı (400) |
| `POST /emirler/:id/yayinla` | `yayinla` | geçerlilik bütün; seri son ürünü var; ilk parça satırları (DY-8); kararlar önerilir (DY-9, DY-10) | D1 akışı, DY-9 - DY-13 | yetki, D1 akışı (400) |
| `POST /emirler/:id/karar` | `karar-ver` | MRB kararı bu uçtan verilmez (403); izinli kod (DY-11); sapma referansı; beklet yalnız not | DY-9 - DY-13 | yetki, DY-9 - DY-13 (403, 400) |
| `POST /emirler/:id/toplu-karar` | `karar-ver` | MRB, beklet, izinsiz ve verilmiş öneri atlanır (DY-13); hiç yoksa 409 | DY-9 - DY-13 | yetki, DY-9 - DY-13 (409) |
| `POST /emirler/:id/mrb-karar` | `mrb-karar` | MRB olmayan karar bu uçtan verilmez (DY-12) | DY-9 - DY-13 | yetki, DY-9 - DY-13 |
| `POST /emirler/:id/fai-onayla` | `fai-onayla` | kararla birlikte ya da uygulamada (DY-2); zaten onaylı 409; bitince doğrulama (DY-14) | D1 akışı | yetki, D1 akışı (409) |
| `POST /emirler/:id/kapat` | `kapat` | yalnız doğrulamada; eksik koşul durdurur, bilinmeyen durdurmaz (DY-15) | D1 akışı | yetki |
| `GET /son-urunler`, `/konfigurasyon/:malzemeId`, `/seriler`, `/izlenebilirlik`, `/raporlar`, `/olaylar` | OKUMA | bağlı olmayan kaynak null; bilinmeyen malzeme 404; rapor aralığı ters ise 400 | listeler | yetki, listeler (404, 400) |

## Kayıt bütünlüğü
- Geçmiş ve iç olay günlüğü yalnız eklenir (`yalniz_ekleme` tetikleri; güncelleme, silme, boşaltma reddedilir). Test: "kısıtlar".
- Karar bir kez ve yalnız izinli kodla verilir (`_verilen_izinli`, `_alanlar`, `_sapmali`); geçerlilik bütündür (`_gecerlilik_butun`). Test: "kısıtlar".
- İmzalı olaylar imza anlamını taşır (S0 `IMZA_ANLAMLARI`); kişi oturumdan, zaman veritabanından.
- Her komut kaydı kilitler (FOR UPDATE), sürümü denetler (409 ESKI_SURUM) ve aynı transaction'da geçmiş ve olay yazar.

## Denetim kaydı
Yazma uçları gövdeyi denetime tam yazar (çekirdek varsayılanı). Gövdede parola ya da anahtar yok.

## Dış çağrı
Yok. İç olay günlüğü dışarı gönderilmez (1124 a).
