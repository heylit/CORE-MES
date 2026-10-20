# Uyum borcu dokumu (Asama 1, 1. tur sonu)

Salt okuma; depoda dosya degismedi, commit yok. Tarih 2026-10-08.

## Okunan commitler

| Parca | Dal | Commit | Durum |
|---|---|---|---|
| main | main | 27cf5bd | 172 (ortak arayuz) birlesmis: 27cf5bd, 2b92d04 |
| cekirdek | 259-cekirdek-istekleri | 4b5c3dc | birlesmedi |
| ortak arayuz | 172-ortak-arayuz-eksikleri-xo2mfl | 8b1e5d0 | birlesti (main'de yeniden yazilmis hal 27cf5bd) |
| malzemeler | 163-malzemeler-oturtma-o7b51n | ad58498 | birlesmedi |
| istasyonlar | 186-istasyonlar-oturtma | bc2394a | birlesmedi |
| arkon | 199-arkon-oturtma | 1cf2037 | birlesmedi |
| satin alma | 162-satin-alma-uyum | 37aadba | birlesmedi |

Kaynaklar: `sunucu/moduller/{arkon,malzemeler,satin-alma}/UYUM-BORCU.md` (main ve dallar; `git diff origin/main...origin/<dal>`),
`sunucu/moduller/istasyonlar/UYUM-BORCU.md` (yalniz 186 dalinda var), modullerin `CEKIRDEK-ISTEKLERI.md` dosyalari.
DOGRULANDI: cekirdek ve ortak arayuzun UYUM-BORCU dosyasi yok (`git ls-tree` alti dalda). Onlarin borcu
`/mnt/project-files/cekirdek/259-liste-ve-etki-raporu.md` (b) ve `/mnt/project-files/ortak-arayuz/1-tur-liste.md` (b)'den alindi.

Isaretler: **[K: dal]** bu turda o dalda kapandi (dal birlesince gecerli); **[KK: dal]** kismen kapandi; isaretsiz = acik.
"Bu turda kapanan" yalniz main ile dallarin farkindan okundu; borc dosyasi guncellenmeden kapanani (cekirdek dalindaki kod) ayrica yazdim.

## Sayilar

Kullanimi tutan 9, etkileyen 27, sonra 55 (sonra: arkon 22, malzemeler 12, satin alma 14, istasyonlar 3, cekirdek 3, ortak arayuz 1).
Bu sayilara bu turda kapananlar da dahil (isaretli). VARSAYIM: madde bolmesi benim; borc dosyalarinda numarasiz maddeleri satir basina bir saydim.

## 1. Kullanimi tutan (bir akis ya da rol acilisi bunlar kapanmadan calismaz)

| No | Parca | Madde | Nerede | Durum |
|---|---|---|---|---|
| T1 | arkon / cekirdek | Hicbir rolde `sayfa.arkon` ve `arkon.*` yok; akis A yalniz bayrakli yoneticiyle kosar | arkon UYUM-BORCU "Kullanima acmadan once" | [K: 259] goc `20261008012100_kisiler_bakim_rolu_arkon_islemleri.sql` (a7f0d93) alti role verir |
| T2 | cekirdek + istasyonlar, malzemeler, satin alma, uretim-emirleri | Okuma uclarinda sayfa yetkisi yok (#247): `GET /istasyonlar`, `/makineler`, `/is-merkezleri` oturumla acik; malzemeler denetimi serviste; satin alma `GET /satin-alma-acilis` `oturum` | istasyonlar madde 1; malzemeler "Okuma uclari"; satin alma madde 7 | [KK: 259] cekirdek kalibi geldi (c7324c8, ADR 0007); modullerin baglamasi acik, hicbir modul dali kullanmiyor |
| T3 | satin alma | Rol x islem satiri yok: akis C yalniz bayrakli yoneticide | madde 6 | acik; matris istegi CEKIRDEK-ISTEKLERI Ç3, 259'da yok |
| T4 | satin alma | Firma bagi yok: finans gelene kadar yeni tedarikci EKLENEMEZ (S1 karari sonucu) | madde 1, 2 | [KK: 162] yetki acigi kapandi (SAT-41 uygulanir); finans yok, akis C ve D tutuk |
| T5 | satin alma / stok | Mal kabul stokta (sabit kimlik) ama satin almanin kendi `teslim-al` ucu ve ekrani var | "Baglamada kapanmayacak" son satir (162'de yeni) | sahiplik sorusu acik |
| T6 | arkon | `queued` -> duraklat bagli degil; Arkon baska emre gecince TMI'de eski emir "basladi" kalir, istasyonda tek baslamis emir kurali yeni emri reddettirebilir | sinir (d), "Baglamada kapanacak" (#241) | acik; akis A'da emir degisiminde |
| T7 | istasyonlar | Ekip ve yuzdeli kapasite (#105) ayri dalda, main'in cok gerisinde, bir karari acik | madde 6 | acik; akis B oncesi |
| T8 | malzemeler | Ikinci menu prototip dosyasinin icinde; toplayicida yok | madde 6 (#198) | acik (163'te degismedi; `IKINCI_MENULER` 163'te yalniz ARKON) |
| T9 | istasyonlar | Ikinci menu yok; ekran kendi sekmelerini ciziyor | madde 2 | acik; toplayici istegi cekirdege iletildi, 259'da yok |

Not T8, T9: sartnamede Asama 1 sarti "menude ve ikinci menude gorunur" oldugu icin tutan sinifina koydum (VARSAYIM; kullanim akisini durdurmaz, kabul sartini durdurur).

## 2. Kullanimi etkileyen

| No | Parca | Madde | Durum |
|---|---|---|---|
| E1 | arkon / cekirdek | Arka plan yineleyici yok: kayit gelmezse bekleyen yansima emre gecmez (sinir f). Kullanici karari C3: borcta kalsin | acik |
| E2 | arkon | Sayim baslama kaydindan once gelirse artik bekler; baslama hic gelmezse sayim TMI'ye yazilmaz | [K: 199] ret kalkti (sinir c); kalan bekleme |
| E3 | arkon | Yansima okuma ucu ve ekrani geldi; `arkon.yansima-oku` hicbir rolde yok | [K: 199] uc (sinir e); rol satiri istegi arkon CEKIRDEK-ISTEKLERI 1, 259'da yok |
| E4 | arkon | 259 rol gocundeki `LIKE 'arkon.%'` denetimi `arkon.yansima-oku` satirina takilabilir (VARSAYIM, iki dal birlikte kosulmadi) | arkon CEKIRDEK-ISTEKLERI 2; acik |
| E5 | arkon | `hatali` yansima kalicidir, yeniden kuyruga alma komutu yok (#243) | acik |
| E6 | arkon | Sessiz kayip: ekran reddi gostermiyordu | [KK: 199] TMI bildirimiyle soylenir; reddedilen icerik saklanmaz |
| E7 | arkon | Ortak tablette cevrimdisi kuyruk sonraki kisinin oturumuyla gidiyordu | [K: 199] kuyruk ogesi kisiyi tasir; kalan: kisi bir daha girmezse oge tablette kalir |
| E8 | arkon | Depo basina yetki tablosu: rol depodaki her alani yazabiliyordu | [KK: 199] dort alan kurali (`alanYetkisiReddi`); kalici cozum #223 |
| E9 | arkon | Kalitenin reddettigi paket yayinlanabiliyordu, onaysiz yeniden olusturma | [KK: 199] kapandi; kalan `apOk` `updatedAt` denetimi (istemciden geliyor) |
| E10 | arkon | Guvenlik aciklari: dolu `results` yazimi (#223), arizada `openedBy` ustleneni gosterir, silmede surum zorunlu degil, cerceve `sandbox` yok, kok `<svg>` zorunlu degil, ileti kapsam suzmesi yok | acik (rol acilinca etkiler) |
| E11 | arkon | Ikinci menu maddeleri `sayfa.arkon` ile gorunur; rolunun gormedigi maddeye tiklayan ilk sayfaya doner; menu sayaci yok | acik; T1 birlesince gorunur olur |
| E12 | arkon | Tarayicida veri (IndexedDB, `localStorage`) cikista silindigi dogrulanmadi | acik |
| E13 | arkon | Arkon tesis kodlarini metinle tutar, yabanci anahtar yok; SMARTES alani yok | istasyonlar madde 7; acik |
| E14 | istasyonlar | Kisi is merkezi kisiti ekrani hicbir sayfaya bagli degil; kisit yalniz API ile | madde 3; acik |
| E15 | istasyonlar | Operasyon tipi katalogu: ekran ve yazma ucu yok; malzemeler `OPS`, `OP_VARSAYILAN` ve Arkon operasyon metni bagli degil | madde 4; [KK: 186] bos katalog ve tohum geldi (79d183b, bc2394a) |
| E16 | malzemeler | Kartin tur, onay durumu, benzersiz anahtar ve onek istemcinin `ozet`inden; baska modullere verilen kullanilabilirlik bu sutuna dayanir | madde 1; acik |
| E17 | malzemeler | Ekranda kalan kurallar (alan dogrulama, tanim listeleri, agirlik hesabi, onek uretimi) sunucuda yok | madde 4; acik |
| E18 | malzemeler | Excel, QR, belge yukleme kapali (CDN engelli, dosya saklama #82 yok) | madde 5; acik |
| E19 | malzemeler | Yalitilmis cerceve geldi; cihazda indirme, etiket yazdirma, QR/kamera, pano denenmedi; `allow-popups` yok | [K: 163] madde 7 ve denetim 5 (ee6c80c); yeni borc: cihazda deneme |
| E20 | malzemeler | Sahte fark ile baska icerik onaylatma | [K: 163] sunucu farki yazar (#226, e805e7c, bc4024d); kalan: onayci ham alan yolu gorur |
| E21 | malzemeler | Dort goz degisiklik talebinde yalniz ekranda (`talepYetkili`); 2c "kalsin" | acik |
| E22 | malzemeler | Ekran ayar sayfasini kendi 'yonetici' rolune baglar; mudur onay akisi anahtarini gorur, degistirince 403 | [yeni: 163] ad58498 ile dogan borc |
| E23 | malzemeler | Bilinen sinirlar: ekranin kabul ettigi girdiyi sunucu reddeder, kullanici "Kayit yapilamadi" gorur (elle stok kodu, baskasinin talebi, pasif kart) | acik |
| E24 | satin alma | Teklif fiyati denetim kaydina TAM girer; karar S2 ozet seciciyi istiyor, cekirdek secici sigmiyor | madde 13; acik (CEKIRDEK-ISTEKLERI Ç2) |
| E25 | satin alma | `satin_alma_katalog.malzeme_id` yabanci anahtari yok | madde 5; acik |
| E26 | cekirdek | Dosya saklama yok (#82): malzemeler belge yukleme kapali, Arkon kendi dosya deposunu tasir | 259 raporu (b) 7; acik |
| E27 | satin alma | Menu sayaclari yok (`sayacUcu` verilmedi) | madde 17 kalani |

## 3. Sonra (kalip uyumu, bilgi, ikinci kat)

Arkon (22): belge deposu jsonb; kendi dosya deposu (#82); surum, liste, kisit kaliplari disinda (#168, #90, #169); butun uclar `yetki: 'oturum'` + `rolGerekli`; ince islemler (#223, gecici rol listeleri); denetim kaydinda belge govdesi tam (karar bekliyor); ust duzey `arkon/` ve ayri derleme, tasarim degiskeni yok; ileti yoklamasi 2 sn; cerceve baglamasi standart koprusuz; kilit bekleme butcesi yok; `korumaliIsle` ve `geciciHataMi` dogrudan testsiz; `emir_id` yabanci anahtari yok; `yeniEmirler` olu durum; P0001 testleri; kismi dizin plan testi ortama duyarli; `sonuc <> 'yazildi'` dizini yok [yeni: 199]; dosya kotasi kilitsiz; SMARTES alanlari (#213); `POST /arkon/dosyalar/eksikler` okuma oldugu halde komut; `/arkon/kisiler` `kisiler.oku` aramaz; `strict: false`; `npm audit` uc kayit (pdfjs, tar, node-pre-gyp).

Malzemeler (12): ekran kendi stili, lint taramaz (madde 2); `mk-*` localStorage [K: 163, bellek ici depo on betigi]; surum, liste, kisit kaliplari (#90, #169, #168); sablon ve ayar surumsuz, sablon ustune yazma VARSAYIM (#228); sablon silme dugmesi herkese (#234 madde 18); denetim kaydinda kart icerik farki okunamaz; NOTLAR.md ve sozlesmede yaniltici cumle; MKK-10 yari mamul, mamul, demirbasta anahtar null; Logo alanlari (`logo_kart_turu`, `logo_birim_seti`, `logo_kayit_no` yok; stok kodu 24 veritabani kisiti yok; #205); `aktif_oldu` iz birakmamis eski kart; `test:modul` Linux'ta 0 test [K: 259, 8785daf]; `YalitilmisCerceve.tsx` ve `yalitim.ts` modul kopyasi [yeni: 163; ortak bilesen main'de (27cf5bd), kopya silinebilir].

Satin alma (14): alt kayit surumu ve uuid kimlik (madde 8, karar bekler); liste sayfasiz (10); `kisitKorumali` yok (11); veri kapsami VARSAYIM (12); Logo alanlari, `siparis_no` 40/benzersiz degil (14); ekran duz DOM, 41 `innerHTML`, ortak bilesen yok (15); 6 satir ici stil, 360/768/1280 olculmedi (16); canli guncelleme yok (18, bilgi); ekran cizim testi yok (19); olu akis yedek/TCMB isleyicileri (20); bos durum metni yanlis (madde 4 kalani); tekrar korumasi [K: 162]; SAT-42 ayri test [K: 162]; testler `firmaKaynagi`'na bagli (madde 3 kalani).

Istasyonlar (3): kisi kisiti listesi tumden yazilir, son yazan kalir (5); test `kisi` tablosuna dogrudan yazar (8); `disari.ts` tipleri surum tasimaz (9).

Cekirdek (3): #157 defter haklari ikinci kat; ekran kurallari istisnasi (Ç1: malzemeler, satin alma, arkon ekranlari); `sinir` araci `arkon/` klasorunu tanimiyordu [K: 259, 4b5c3dc].

Ortak arayuz (1): #172 kalanlari (tarih/saat secici, dosya yukleme, disa aktarma, grafik, bildirim yuvasi).

## Bu turda kapananlar (ozet)

- 259 (birlesmedi): Arkon rolleri ve bakim rolu (a7f0d93); okuma ucunda sayfa islemi kalibi (c7324c8); `test:modul` glob (8785daf); `sinir` `arkon/` klasoru (4b5c3dc); `malzemeler.tanim-yaz` mudur ve planlamaya (9316f0e).
- 172 (birlesti): yalitilmis cerceve ve bellek ici depo ortakta (27cf5bd).
- 163: sandbox ve opak koken (madde 7, denetim 5); sunucu farki (#226); `mk-*` localStorage bellek ici; onay akisi anahtari yalniz bayrakli yonetici.
- 199: sayim erteleme (c); yansima okuma ucu (e); sessiz kayip kismen; ortak tablet kuyrugu; depo basina tablo dar kapanis; reddedilen paket yayini.
- 162: SAT-41 uygulanir (yetki acigi); `/firmalar/*` cagrilari kalkti (madde 4); testler acildi (3, 21); tekrar korumasi (9); ikinci menu (17).
- 186: dosya yeni; surum denetimi is merkezi, istasyon, makine guncellemesinde (966c8aa) borc listesinde yoktu, ek bilgi.

## Dikkat

- 162 dali toplayiciya (`paylasilan/sayfalar.ts` `IKINCI_MENULER`) kendisi satir ekliyor (37aadba); proje talimati kural 2 toplayiciya dokunmayi istek olarak ister, kendi borc dosyasi da "toplayici satiri cekirdek istegidir" diyor. Birlestirmede bilinmeli.
- Borc dosyalari cekirdek dalinin kapattiklarini bilmiyor (arkon "rol gocu bekletiliyor", malzemeler madde 8 hala acik yaziyor); 259 birlesince dosyalar eskir.

## Ikinci tur icin onerim (en cok 10)

1. T1 + E3 + E4: 259'u birlestir; `arkon.yansima-oku` mudur ve planlamaya, 259 gocu ile birlikte kosulup takilma sinansin.
2. T2: istasyonlar, malzemeler, satin alma okuma uclarini 259 kalibina bagla (serviste denetim kalksin); uretim-emirleri ve durus-nedenleri icin istek iletilsin.
3. T6: `queued` -> duraklat (#241); akis A denemesinden once.
4. T8 + T9: malzemeler ve istasyonlar ikinci menusu (toplayici satirlari cekirdekten tek commit).
5. T3: satin alma rol matrisi (Ç3) kullaniciya sorulup cekirdekte gocle.
6. T5: mal kabul sahipligi (stok mu satin alma mi) kullaniciya sorulsun; akis C buna bagli.
7. E16 + E17: malzeme kartinin tur, onay durumu ve onek alanlarini sunucu `kayit`tan uretsin (akis A'nin ilk adimi).
8. E14: kisi is merkezi kisiti ekrani bir sayfaya baglansin (kapsam kurali yalniz API ile verilemez).
9. E10: Arkon guvenlik kalanlari (dolu `results`, silmede surum, `openedBy`) rol acilmadan once.
10. E24: cekirdek denetim seciciyi onceki degeri gorecek bicimde genisletsin; satin alma fiyat kaydi S2'ye uysun.
