# GUVENLIK-DENETIMI: etiket-merkezi

Testler `etiket-merkezi.test.ts` (gerçek PostgreSQL, gerçek giriş). Oturumsuz istek çekirdekte 401.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /etiket-merkezi/sablonlar` | `biri: sayfa.etiket-merkezi` | yalnız kodda duran hazır şablonlar | EM-U1 | EM-U1 (sayfası olmayan 403) |
| `GET /etiket-merkezi/etiketler` | `biri: sayfa.etiket-merkezi` | yalnız katalog (`etiket_merkezi_etiket_turu`, kart #1292); kayıt ve kişi taşımaz; yazma ucu yok | EM-U17 | EM-U17 (sayfası olmayan 403) |
| `GET /etiket-merkezi/sablonlar/:anahtar/cikti` | `biri: sayfa.etiket-merkezi` | anahtar deseni; dil `zpl`/`pplb`; dpi 203/300; adet 1-500; EM-1; EM-5, EM-6 kaçış | EM-U2, EM-U3 | EM-U1 (403), EM-U4 (404, 400) |
| `GET /etiket-merkezi/sablonlar/:anahtar/kayit-cikti` | `etiket-merkezi.oku` | tür `konum`, `raf`, `lot`, `istasyon`, `refakat-partisi`, `malzeme`, `mal-kabul`, `kalite-durum`, `hatali-parca`, `sevk-koli`; kimlik listesi 1-200, sayı; EM-11, EM-12; bulunamayan kimlik basılmaz | EM-U9, EM-U18, EM-U19, EM-U20 | EM-U9, EM-U18, EM-U19, EM-U20 (koliSayisi 1-500 ve koliIci > 0 yalnız sevk-koli, EM-24; sayfa işlemi yetmez 403; tür uyuşmazlığı, bozuk liste, sınır 400; hiçbiri yok 404) |
| `GET /etiket-merkezi/raflar` | `etiket-merkezi.oku` | yalnız kullanımdaki raflar (pasif yok); kod, ad, bölüm kodu (#116) | EM-U15 | EM-U15 (sayfa işlemi yetmez 403) |
| `GET /etiket-merkezi/yazicilar` | `biri: oku, yazici-yaz` | doğrudan baskı nedeni adres ya da değer taşımaz (EM-9) | EM-U5 | EM-U5 (403) |
| `POST /etiket-merkezi/yazicilar/ac`, `/:id/guncelle` | `etiket-merkezi.yazici-yaz` | EM-8 tek IP, aralık içi, ad çözülmez; sürüm; ad tekil (409) | EM-U5, EM-U6 | EM-U5 (403), EM-U6 (aralık yok, dışı, ad) |
| `POST /etiket-merkezi/sablonlar/:anahtar/bas` | `etiket-merkezi.bas`, tekrar korumalı | EM-9, EM-10 her gönderimde yeniden; yalnız 9100; hata iletisi adres taşımaz | EM-U7, EM-U10 | EM-U7 (kapalı ayar, dosya yazıcısı, deneme dışı, adet, 403), EM-U8, EM-U10 (kayıtsız konum şablonu, türü uymayan kayıt) |
| `GET /etiket-merkezi/baskilar` | `etiket-merkezi.oku` | defter yalnız eklenir (tetikleyici) | EM-U8 | EM-U8 (403, DELETE reddi) |

Denetim kaydı: yazıcı tanımı `degistiren_kisi_id` ve sürümle, her baskı defterde (kişi, zaman, sonuç) tutulur.
Açılış: `TMIV2_ETIKET_YAZICI_AGI` bozuk ya da kurum dışıysa sunucu açılmaz, ileti değeri söylemez (EM-8 ikinci test).
Roller (99 evet) kişiler göçlerinde: oku ve bas depo, planlama_proje, kalite, mudur, vardiya_sorumlusu; yazici-yaz ve sablon-yaz mudur ve yönetici; operatörde yok.
