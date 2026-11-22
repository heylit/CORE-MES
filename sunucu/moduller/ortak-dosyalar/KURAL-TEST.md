# Kural -> test: ortak-dosyalar

`ortak-dosyalar.test.ts` gerçek PostgreSQL ve gerçek giriş; `kurallar.test.ts` saf; `istemci/src/moduller/ortak-dosyalar/OrtakDosyalar.test.tsx` ekran.
Test adları başlığın başıdır.

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| OD-1 Düzeyler sıralı | `kurallar.test.ts` `OD-1` | aynı test: alttaki üsttekini içermez |
| OD-2 Miras: en yakın özel üstün satırları | `OD-2 miras ...`, `OD-2/5 ...` | `OD-2 kopuk ya da döngülü zincir ...` |
| OD-3 Düzey rollerin en yükseği; yönetici her yerde yonetir | `OD-3 ...` | aynı test: rolsüz `yok` |
| OD-4 Bilinmeyen klasör `yok` | - | `OD-4 ...` |
| OD-5 Görünmez klasör listede yok, doğrudan istek 404 | `OD-2/5 ...` | aynı test: 404; `kurallar.test.ts` `OD-5` |
| OD-6 Ad anahtarı tr-TR, harf duyarsız | `OD-6 ...` | `OD-10 ...` (aynı ad 409) |
| OD-7 Tür sınırı ve yükleyen bağlar | `OD-11 ...` (PDF) | `OD-7 ...` (STEP 400, başkasının içeriği 400) |
| OD-8 Sayfa işlemi şart | - | `OD-8 ...` (403) |
| OD-9 Kökü yalnız yönetici açar | `OD-9 ...` | aynı test: 403 |
| OD-10 Alt klasör yonetir ister | `OD-10 ...` | aynı test: ekler 403, aynı ad 409, `/` 400 |
| OD-11 Yükleme ekler ister; aynı ad yeni sürüm; eski sürüm iner | `OD-11 ...` | aynı test: gorur 403, başka klasör yolu 404 |
| OD-12 Arşiv yonetir; arşivde indirme yok; geri alma | `OD-12 ...` | aynı test: ekler 403, ikinci arşiv 409, çakışan geri alma 409 |
| OD-13 Yetki sekmesi yalnız `yetki-ver` | `OD-13 ...` (yönetici okur) | aynı test: 403, yönetici satırı 400, köke miras 400, eski sürüm 409 |
| OD-14 Yetki değişikliği hemen geçer | `OD-14 ...` | aynı test: özel yetkiyle gizlenen klasör 404 |
| OD-15 Son eklenenler yalnız görünenler | `OD-15 ...` | aynı test: gizli klasörün dosyası yok |
| OD-16 Geçmiş ve denetim izi | `OD-16 ...` | - |
| OD-17 Sayfa bütün rollere (karar 2067-3 b), yetki-ver yalnız yönetici | `OD-17 ...` | göç satırı silinirse kırmızı |
| OD-18 Dosya adının uzantısı içerikten bulunan türle uyuşur (`.bat` adlı metin, `.exe` adlı PDF reddedilir) | `OD-18 ...` | aynı test: uzantısız ad 400, ret sonrası kayıt kalmaz |

## Kayda bağlı klasörler (kart 3288; ADR 0030 eki)
`kayit-klasorleri.test.ts` gerçek PostgreSQL ve gerçek giriş; `kurallar.test.ts` saf; `istemci/.../KayitKlasorleri.test.tsx` ekran.

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| KK-1 Sistem adı kayıttan; ayırıcı tireye, 120'de kesilir; ad kaydı izler | `KK-1 ...`, `kurallar.test.ts` `KK-1` | aynı test: ad çakışması hata listesine |
| KK-2/3/4 Firma, sipariş, proje adları ve yerleri; şablon alt klasörleri; eşgüçlü | `KK-2/3/4 ...` | aynı test: ikinci çağrı satır açmaz |
| KK-5 Yükleme adı önerisi | `KK-5 ...`, `kurallar.test.ts` `KK-5`, ekran "ad önerisi" | - |
| KK-6 Şablon adları tekil; yalnız sonra açılana | `KK-6 ...` | aynı test: tekrar 400, yetkisiz 403 |
| KK-7 Arşivdeki klasör ve altı görünmez | `KK-7 ...`, `kurallar.test.ts` `KK-7` | aynı test: 404 |
| KK-8 Kural reddi kaydı durdurmaz; satır aynı işlemde; iç içe ara nokta | `KK-8 ...` (üç test) | dış ret iç açmayı geri alır |
| KK-9 Kök yalnız yetki-ver, bir kez; aynı adlı kökte durur; düzeyler 2067-5 a | `KK-9 ...` | aynı test: 403, 409 |
| KK-10 Kayıt bağlantısı görünürlüğe bağlı | `KK-10 ...` | aynı test: 404 |
| KK-11 Toplu komut: sayı, grup, eşgüçlü, toplu iş arşivi | `KK-11 ...`, ekran "gruplar halinde" | aynı test: sayı değişince 409, yetkisiz 403 |
| KB-1..4 Kayıt olayı klasörü aynı işlemde açar; firma, sipariş ve proje adını izler; iki yönlü firmaya açar, tedarikçiye açmaz; iptalde arşiv; toplu komut klasörsüz sipariş ve projeyi sayar ve açar (3288-2) | `kayit-baglari.test.ts` `KB-1..4` | Bildirimi kaldır (proje değişti, sipariş güncelle), `ikisi`yi müşteri sayma, toplu kaynaktan sipariş ya da projeyi çıkar: her biri 1 kırmızı |
| Kayıt ekranında "Klasör" bağlantısı; `?klasor=` klasörü seçer | `KayitKlasorleri.test.tsx` "Klasör bağlantısı" | 404'te bağlantı çizilir |

## Kart 3443
| Kural | Test | Kırmızı denemesi |
|---|---|---|
| OD-30 Müşteri yalnız müşteri ya da ikisi; proje seçilen müşterinin; müşteri boşsa projeninki; yeni sürüm değiştirmez; süzgeç | `kalici-silme.test.ts` `OD-30` (saf, yükleme, seçici), ekran "tek dosyada", "müşteri değişince" | tedarikçi 400, başka müşterinin projesi 400 |
| OD-31 Kayda bağlı klasörde seçim klasörden | `OD-31`, `KayitKlasorleri.test.tsx` "tek dosyada", "birden çok dosya" | gönderilen değer yok sayılır |
| OD-32 Yazılan ad dosya adıyla aynı (Türkçe harf duyarsız, kenar boşluğu sayılmaz) | `OD-32`, `OD-34`, ekran "Kalıcı sil" | yanlış ad 400 |
| OD-33 Kendi isteği onaylanmaz; yalnız isteyen geri çeker | `OD-32/33`, `OD-36` | 403 |
| OD-34 Yalnız arşivde, Yönetir; sürümler ve bağlar kalkar; defter, denetim eki, Geçmiş kalır | `OD-34` | etkin dosya 409, Görür 403, görünmeyen 404, eski sürüm 409 |
| OD-35 Paylaşılan içerik başka bağda kalır | `OD-35` | - |
| OD-36 Dört göz: doğrudan silme 409; istek, onay, ret, geri çekme | `OD-36`, ekran "dört göz açık" | ikinci açık istek 409 |
| OD-37 Geri alma isteği düşürür; ayar kapanınca açık istek sürer | `OD-37` | - |
| OD-38 Veritabanı kısıtları (tek açık istek, dört gözde isteyen onaylayamaz) | `OD-38` | kısıt ihlali |
| AD-1 Aynı dosya uyarısı (3468-1): aynı içeriğin görünen klasördeki ve okunabilen çizimdeki yerleri; görünmeyen klasör yok | `ayni-dosya.test.ts` `AD-1` | görünmeyen klasördeki kopya ne satırla ne sayıyla |
| AD-2 Çizim yeri yalnız çizim okuyana, klasör yeri yalnız sayfası olana; uçlar 403 | `AD-2` | iki uç 403 |
| AD-3/4/5 Bilinmeyen içerik boş; uyarı yüklemeyi engellemez; arşivdeki dosya yok, arşivdeki belge "Arşivde" | `AD-3`, `AD-4`, `AD-5`; ekran `aynı dosya uyarısı (3468-1)` | bozuk özet 400 |
| OD-39 Seçici eki (3571): başka modül kişinin kendi düzeyiyle okur; görünmeyen klasör, arşivdeki dosya, olmayan sürüm ve sayfa işlemi olmayan kişi null; dar klasör (yönetici olmayan bir rol göremiyor) işaretli | `ortak-dosyalar.test.ts` `OD-39` | görünmeyen klasördeki dosya null; her rolün gördüğü klasör dar değil |
