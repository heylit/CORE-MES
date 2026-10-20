# Güvenlik denetimi (finans, tam teslim, taban c2c9871)

## 1. Uçlar (62; kaynaktan üretildi: `sunucu/moduller/finans/uclar.ts`)

Her uç `uc()` ile tanımlıdır, tek yetki ister; gövde, parametre ve sorgu zod şemasından geçer, şemada olmayan alan atılır. Yazma uçlarının hepsi denetim kaydına düşer (toplu aktarım gövde yerine özetle). Düzeltme ve iptal uçları (belge, çek, firma, hesap, kur, düzenli ödeme, ayar düzeltmesi; belge, ödeme, dağıtım, mahsup, çek, virman iptali) kayda değişen alanların önceki ve yeni değerini ek olarak bırakır (FNS-61); ek yazılamazsa komut geri alınır. Test adları KURAL-TEST.md'deki adlardır ("para:" = `para.test.ts`, "firma:" = `firma.test.ts`).

| Uç | Yetki | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /finans/ozet | finans.oku | son kurlar; geciken tahsilat, 7 günde ödeme ve portföydeki çekin sayısı ve TL toplamı; nakit TL (firma ya da belge ayrıntısı yok) | para: "pano özeti", "pano rakamları" | para: "pano özeti" (firmacı 403, oturumsuz 401) |
| GET /finans/belgeler | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/odemeler | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/dagitimlar | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/mahsuplar | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/cekler | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/hesaplar | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/virmanlar | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/kurlar | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/kdv-oranlari | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/duzenli-odemeler | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/butce | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/bakiye-esitlemeleri | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/oneri-durumlari | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/kapanis | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/skorlar | finans.oku | sayfalı (en çok 200), iptaller istenirse | para: listeler (belgeOku ve öteki) | para: yetki (firmacı 403, oturumsuz 401) |
| GET /finans/firmalar | finans.firma-oku | FNS-43..49, FNS-53, D-9 | firma: FNS testleri | firma: yetki, FNS-39, saldırı |
| GET /finans/firmalar/secim | finans.firma-oku | FNS-43..49, FNS-53, D-9 | firma: FNS testleri | firma: yetki, FNS-39, saldırı |
| GET /finans/firmalar/:id | finans.firma-oku | FNS-43..49, FNS-53, D-9 | firma: FNS testleri | firma: yetki, FNS-39, saldırı |
| POST /finans/firmalar/ekle | finans.firma-yaz · tekrar korumalı | FNS-43..49, FNS-53, D-9 | firma: FNS testleri | firma: yetki, FNS-39, saldırı |
| POST /finans/firmalar/:id/guncelle | finans.firma-yaz | FNS-43..49, FNS-53, D-9 | firma: FNS testleri | firma: yetki, FNS-39, saldırı |
| POST /finans/firmalar/:id/pasif | finans.firma-yaz | FNS-43..49, FNS-53, D-9 | firma: FNS testleri | firma: yetki, FNS-39, saldırı |
| POST /finans/firmalar/:id/aktif | finans.firma-yaz | FNS-43..49, FNS-53, D-9 | firma: FNS testleri | firma: yetki, FNS-39, saldırı |
| GET /finans/ayar | finans.oku | FNS-39 | para: ayar testi | para: ayar (409), yetki (yazan 403) |
| GET /finans/menu-sayaclari | oturum | rakam sızmaz | para: yetki (okuyan sayı) | para: yetki (firmacı null) |
| POST /finans/belgeler/ekle | finans.yaz · tekrar korumalı | FNS-1..6, 11, 37, 46, 51; peşin/çek ile FNS-15..16 | para: FNS-1, FNS-4..6, peşin | para: FNS-1, FNS-2, FNS-46, FNS-51, yetki |
| POST /finans/belgeler/:id/duzelt | finans.yaz | FNS-9, 10, 39 | para: FNS-9, FNS-10 | para: FNS-9 (422, 409), FNS-10 |
| POST /finans/belgeler/:id/iptal | finans.yonet | FNS-13, 14 | para: FNS-13, FNS-14 | para: yetki (yazan 403), ikinci iptal |
| POST /finans/odemeler/ekle | finans.yaz · tekrar korumalı | FNS-7, 15..20, 46 | para: FNS-7, FNS-20 | para: FNS-19, FNS-20, FNS-46 |
| POST /finans/odemeler/:id/dagit | finans.yaz · tekrar korumalı | FNS-7, 18, 19 | para: FNS-18 | para: FNS-7 (aşan), FNS-18 |
| POST /finans/odemeler/:id/iptal | finans.yonet | FNS-13, 21 | para: FNS-21 | para: FNS-21 (403, 422) |
| POST /finans/dagitimlar/:id/iptal | finans.yonet | FNS-13 | para: B-012 (belge açılır, avans döner) | para: B-012 (403, ikinci iptal 422) |
| POST /finans/mahsuplar/ekle | finans.yaz · tekrar korumalı | FNS-55, 56 | para: FNS-55, FNS-56 | para: FNS-55 (aşan, başka firma, iptal belge, 403) |
| POST /finans/mahsuplar/:id/iptal | finans.yonet | FNS-55, 56 | para: FNS-55, FNS-56 | para: FNS-55 (aşan, başka firma, iptal belge, 403) |
| POST /finans/cekler/ekle | finans.yaz · tekrar korumalı | FNS-22, 24, 46 | para: FNS-22..24 | para: FNS-46 |
| POST /finans/cekler/:id/duzelt | finans.yaz | FNS-28 | servis | para: FNS-22..24 (sonuçlanmış çek 422) |
| POST /finans/cekler/:id/tahsile-ver | finans.yaz | FNS-22 | para: FNS-22..24 | para: aynı geçiş 422 |
| POST /finans/cekler/:id/tahsil | finans.yaz | FNS-22, 23 | para: FNS-22..24 | para: kasa hesabı 422 |
| POST /finans/cekler/:id/odendi | finans.yaz | FNS-22, 23 | para: B-012 (hesaptan çıkar, geri alınca döner) | para: alınan çekte 422 |
| POST /finans/cekler/:id/ciro | finans.yaz · tekrar korumalı | FNS-26, 54 | para: FNS-26 | para: müşteriye ciro 422, ikinci ciro 422 |
| POST /finans/cekler/:id/karsiliksiz | finans.yonet | FNS-25, 27 | para: FNS-25, FNS-27 | para: yazan 403, ikinci kez 422 |
| POST /finans/cekler/:id/geri-al | finans.yonet | FNS-22 | para: FNS-26 (geri al) | yetki (finans.yonet) |
| POST /finans/cekler/:id/iptal | finans.yonet | FNS-13, 22 | servis | yalnız portföy/bekliyor |
| POST /finans/hesaplar/ekle | finans.yonet | FNS-29..32, 59 | para: FNS-29 | para: FNS-32, FNS-59, ad tekil 409 |
| POST /finans/hesaplar/:id/guncelle | finans.yonet | FNS-29..32, 59 | para: FNS-29 | para: FNS-32, FNS-59, ad tekil 409 |
| POST /finans/hesaplar/:id/pasif | finans.yonet | FNS-29..32, 59 | para: FNS-29 | para: FNS-32, FNS-59, ad tekil 409 |
| POST /finans/hesaplar/:id/aktif | finans.yonet | FNS-29..32, 59 | para: FNS-29 | para: FNS-32, FNS-59, ad tekil 409 |
| POST /finans/hesaplar/:id/esitle | finans.yonet · tekrar korumalı | FNS-29..32, 59 | para: FNS-29 | para: FNS-32, FNS-59, ad tekil 409 |
| POST /finans/virmanlar/ekle | finans.yaz · tekrar korumalı | FNS-30 | para: FNS-30 | para: FNS-30 (para birimi, aynı hesap, 403) |
| POST /finans/virmanlar/:id/iptal | finans.yonet | FNS-30 | para: FNS-30 | para: FNS-30 (para birimi, aynı hesap, 403) |
| POST /finans/kurlar/ekle | finans.yonet | FNS-57 | para: FNS-57 | para: FNS-57 (409, 400, 403) |
| GET /finans/faizler | finans.oku | sayfalı (en çok 200) | para: faiz | para: faiz (403) |
| POST /finans/faizler/ekle | finans.yonet | 0-100, dört ondalık; tablo yalnız ekleme | para: faiz | para: faiz (400, 403, UPDATE ve DELETE reddi) |
| GET /finans/sabit-kiymetler | finans.oku | sayfalı (en çok 200) | para: sabit kıymet | para: sabit kıymet (403) |
| GET /finans/amortisman | finans.oku | son 24 ay, sabit | para: sabit kıymet | para: sabit kıymet |
| POST /finans/sabit-kiymetler/ekle | finans.yonet | tekrar korumalı; ömür 1-600, kalıntı < bedel, devir çifti ve sınırı (kısıt) | para: sabit kıymet | para: sabit kıymet (400, 403) |
| POST /finans/sabit-kiymetler/:id/pasif | finans.yonet | sürüm; ikinci pasif 422; denetim eki | para: sabit kıymet | para: sabit kıymet (409, 422, defter) |
| POST /finans/kurlar/guncelle | finans.yonet | FNS-57 | para: FNS-57 | para: FNS-57 (409, 400, 403) |
| POST /finans/kdv-oranlari/ekle | finans.yonet | FNS-1 | para: FNS-1 | şema (0-100) |
| POST /finans/kdv-oranlari/kapat | finans.yonet | FNS-1 | para: FNS-1 | şema (0-100) |
| POST /finans/duzenli-odemeler/ekle | finans.yonet | FNS-33 | para: FNS-33 | para: FNS-33 (firmasız faturalı 400) |
| POST /finans/duzenli-odemeler/:id/guncelle | finans.yonet | FNS-33 | para: FNS-33 | para: FNS-33 (firmasız faturalı 400) |
| POST /finans/duzenli-odemeler/:id/odendi | finans.yaz · tekrar korumalı | FNS-33 | para: FNS-33, B-003 | para: FNS-33 (firmasız faturalı 400), B-003 (tek oranla oluşamayan toplam 400) |
| POST /finans/butce/belirle | finans.yonet | FNS-35 | para: FNS-35 | para: FNS-35 (ay başı değil 400) |
| POST /finans/ayar/guncelle | finans.yonet | FNS-39; FK1 pay 0-100 arası, gönderilmezse korunur | para: ayar testi; akis-d: "FK1" | para: ayar (409), yetki (yazan 403); akis-d: pay 0 ve 101 400, müdür 403 |
| POST /finans/toplu-ice-aktar | finans.yonet · tekrar korumalı · denetim gövdesiz | FNS-41, 50 | para: FNS-41, FNS-50 | para: FNS-41 (eşleşmeyen firma, 1001 satır, 403) |
| POST /finans/oneriler/durum | finans.yaz | aralık/biçim | para: ayar, öneri | para: okuyan 403, ertele tarihsiz 400 |
| POST /finans/kapanis/isaretle | finans.yaz | dönem biçimi | para: kapanış | para: 2026-13 400 |
| POST /finans/skorlar/kaydet | finans.yaz | 0..100 | para: skor | para: 101 400 |

Genel uç yoktur: "durumu topluca kaydet" biçiminde bir yazma ucu teslimde bulunmaz. Prototipin kendi saklama katmanı (`save`, `connectStorage`) gömülü tam kipte boş işleve çevrilir; her yazma köprüde adlandırılmış türle tek uca gider (`istemci/src/moduller/finans/kopru.ts`, `YAZMALAR`). Bilinmeyen tür, bozuk kimlik ve bilinmeyen çek komutu sunucuya gitmeden reddedilir (istemci testi).

Ek (FNS-60): `POST /finans/firmalar/:id/pasif` açık faturası, faturaya dağıtılmamış ödemesi ya da sonuçlanmamış çeki olan firmayı 422 ile reddeder; ileti ne kaldığını sayar, tutarları yalnız `finans.oku` olana yazar (firma yetkili kullanıcıya rakam sızmaz). Testler: para "FNS-60", kurallar "FNS-60".

## 2. Yalnız ekranda kalan kurallar

- Analizler: nakit tahmini ve Monte Carlo, satış tahmini, Markov alacak modeli, müşteri risk notu, Altman/DuPont, anomali, danışman bulguları, sağlık skoru (skor sunucuya yazılır ama tarayıcıda hesaplanır).
- FNS-34 (açılış ve avansın kâr/zarar dışında tutulması), FNS-36 (tevkifatın vergi ekranındaki yeri), FNS-52 (firma varsayılanının forma önerilmesi), FNS-57 (güncel kurla değerleme), FNS-58 (gelir tablosunda kur farkı satırı).
- Dağıtım planı (en eski vadeden başlayarak) ekranda kurulur; sunucu her satırın sınırını ayrıca denetler (FNS-7, FNS-18).
- "Pasife al" basılınca tam kipte kalan kayıtların önceden sayılıp uyarı gösterilmesi ekrandadır; kural sunucudadır (FNS-60).
- İptal düğmelerinin yalnız `finans.yonet` olana görünmesi ekrandadır; kural uç yetkisindedir.

## 3. Kendi kendine saldırı denemeleri

A) Çalışan sunucuya gerçek HTTP (`npm run sunucu`, PostgreSQL 16.15, yönetici oturumu, curl):

| Deneme | Cevap |
|---|---|
| Oturumsuz `GET /api/finans/belgeler` | 401 `OTURUM_YOK` |
| Elle kurulmuş belge gövdesi: `durum: 'kapandi'`, `kaynak: 'logo'`, `olusturanId: 999`, `toplam: 1` | 200; veritabanında `acik / elle / 1 (oturumdaki kişi) / 120.00` (fazla alanlar atıldı, toplam veritabanında hesaplandı) |
| Aynı istek kimliğiyle yeniden gönderim | 200 ve ilk cevap; belge sayısı 1 |
| 120,00 kalanlı belgeye 500 dağıtım | 422 "Dağıtım belgenin kalan tutarını aşıyor." |
| Eski sürümle belge iptali | 409 `CAKISMA` `eski-surum` |
| Eksi tutar; üç ondalıklı tutar | 400 / 400 (alan `tutar`) |
| Olmayan çek komutu (`/cekler/1/sil`) | 404 |
| `?sayfaBoyu=1;DROP` | 400 alan `sayfaBoyu` |
| 1001 satırlık toplu aktarım | 400 "Tek seferde en çok 1000 satır." |
| TRY belgede kur 5 | 422 "TRY belgede kur 1'dir." |
| Dağıtımı veritabanından doğrudan silme | `ERROR: finans_odeme_dagilimi tablosuna yalnız ekleme yapılır` |

Firma uçlarına yapılan denemeler firma teslimindeki GUVENLIK-DENETIMI.md'dedir (değişmedi).

B) Yetkisiz rol, gerçek giriş akışıyla (`para.test.ts`, `app.inject`, gerçek PostgreSQL): firma yetkisi olup finans yetkisi olmayan kişi bütün finans okuma uçlarında 403, menü sayacında `null`; `finans.oku` olan kişi yazma uçlarında 403; `finans.yaz` olan kişi her iptal, karşılıksız, geri alma, hesap, kur, ayar ve toplu aktarımda 403. Bütün `finans.yonet` ve `finans.yaz` uçları tek testte sayılır (para: "B-012 (GUVENLIK B)"); liste `uclar.ts` ile karşılaştırılır, yeni uç eklenince test kırılır.

C) Tarayıcı (Playwright, gerçek kabuk ve sunucu): tam kipte kurulum, firma, satış, kısmi tahsilat, çekle kapanış, çek tahsili, virman; her adımda belge durumu ve hesap bakiyeleri sunucuyla aynı; analiz motorunun nakdi hesap toplamına eşit (106.200).

## 4. Prototipte innerHTML taraması

- Firma teslimindeki tarama (bütün prototip): 31 HTML basan nokta, 76 yaprak ifade; 3 kaçırılmamış kullanıcı metni bulundu ve düzeltildi.
- Bu teslimde eklenen tam kip katmanı: 8 HTML basan nokta, 13 aday ifade satır satır incelendi. 6'sı sabit alan adı (`name="${ad}"`), 2'si bildirim iletisi (bildirim `esc()` ile basar), 1'i veri dizesi (firma etiketi; basıldığı her yerde `esc()`), 4'ü çekmece başlığı ve açıklaması (çağıranlar kullanıcı metnini `esc()` ile verir).
- Kaçırılmadan basılan kullanıcı metni: 0.
- İçerik politikası: `connect-src 'none'`, `form-action 'none'`, `base-uri 'none'`; dış adresli `src`/`href`, CSS `url()` ve `@import` yok (istemci testi). Grafik kitaplığı satır içi gömülür; içindeki `</script` dizisi kaçırılır.
- Köprü: kaynak pencere ve köken birlikte denetlenir; hedef köken `*` değil.

## Kart #1124
| Uç | İşlem | Kural | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /finans/beklenen-odemeler | finans.oku | faturası gelmemiş siparişin planı | satın alma: SAT-73 ... #1124 (yönetici) | aynı test (satın alma 403) |

`siparisOdemePlaniYaz` yetki denetlemez; çağıran satın almanın `POST /satin-alma-talepleri/:id/odeme-plani` ucu `satin-alma.yaz` ister (belgeSiparisBagla kalıbı).

## Genel gider yük oranı (206 a)
| Uç | İşlem | Kural | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /finans/genel-gider-oranlari | finans.maliyet-oku | oran maliyet bilgisidir; finans.oku açmaz | genel-gider: "yetki:" (okuyan 200) | aynı test (oturumsuz 401, finans.oku 403) |
| POST /finans/genel-gider-oranlari/ekle | finans.yonet | yalnız ekleme; kişi ve zaman sunucudan; gider >= 0, saat > 0, iki ondalık, amortisman alanı zorunlu | genel-gider: "yetki:" (yonetim 200) | aynı test (finans.maliyet-oku ve finans.yaz 403); "doğrulama:" (400); para B-012 |

Tekrar koruması yok: aynı isteğin ikinci kez işlenmesi aynı değerli ikinci satır bırakır ve sonucu değiştirmez (faiz kalıbı).
`genelGiderOrani` yetki denetlemez; çağıran modülün ucu denetler (proje maliyet: finans.maliyet-oku).

Ekran (`/finans/genel-gider`): `finans.maliyet-oku` yoksa liste istenmez; form yalnız `finans.yonet` ile çizilir. Asıl denetim sunucudadır (yukarıdaki iki uç). Testler: `GenelGiderOrani.test.tsx`.
