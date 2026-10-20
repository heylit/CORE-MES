# Arkon ikinci tarayici turu: sonuc

Tarih 2026-10-08, 15:50-16:30. Depo heylit/TMICOREV2, main `a45e794` (#323, #327, #330, #332 icinde).
Depoda dosya degismedi, commit ve dal yok, paket eklenmedi (`git status` temiz; `.env` yalniz kapsayicida, depo disi).

Ortam: bulut kapsayicisi, Node 24.21, PostgreSQL 16 (52 goc), `npm ci`, `npm run derle:arkon`, sunucu 4100, istemci 4101 (gelistirme sunucusu).
Tarayici: Chromium + Playwright (depo disinda, `/opt`). Uygulama sayfalarindan localhost disina giden istek: 0 (betik hepsini yakalar).
Kullanicilar ve veri uydurmadir: `d_mudur`, `d_planlama`, `d_kalite`, `d_cam`, `d_operator`, `d_bakim` (alti Arkon rolu); is merkezleri IM-TOR, IM-FRZ; istasyonlar T01, T02, F01; hurda nedeni "Olcu disi"; durus nedenleri ARIZA (bakim cagrili), MOLA (planli); parcalar DENEME-PARCA-01..05.
Kurulum `betikler/kurulum.mjs`, her adimin betigi `betikler/` altinda. Goruntu yollari bu dosyaya gore.

Isaret: **DOGRULANDI** (tarayicida goruldu, kanit yaninda), **BASARISIZ**, **DENENEMEDI**.

## 1. Borc maddeleri (dort duzeltme)

| Madde | Beklenen | Sonuc | Kanit |
|---|---|---|---|
| TA1, T1 (#323) is degistirme | Calisan isten baska ise gecince eski is duraklar, yeni is TMI'de baslar | **DOGRULANDI** (ayni oturumda gecis). UE-000001'den UE-000002'ye geciste Arkon "DURAKLATILDI", TMI `durakli`; UE-000002 TMI'de `basladi` 15:56:31. Iki emir de bitti. **Kenar durum BASARISIZ**, bkz. Y2 | `a/op5-02.png`, `a/op7-04.png`, `a/20-planlama-emir-1.png`, `-2.png` |
| TA2 (#327) beklenen satirlarin gizlenmesi | Kurulum, "is zaten calisiyor", kuyruga alma, bitmis emir, sifir sayim, bekliyor varsayilan gizli; tur basina sayi; "Gizlenenleri goster" | **DOGRULANDI**. Varsayilan gorunumde 7 satir, 20 gizli (7 / 3 / 9 / 1 / 0 / 0); kutu isaretlenince gizliler "Gizlenen: <tur>" rozetiyle gorunuyor. Gizlenmeyen yeni gurultu var, bkz. Y3 | `a/d_mudur-yansima-varsayilan.png`, `a/d_mudur-yansima-gizlenenler-acik.png` |
| T2 (#327) bitmis emre "bitir" ret degil | "eslenemedi: Emir zaten bitmis", gizli | **DOGRULANDI**. 16:04:25 UE-000002 satiri "Emir zaten bitmis; bitirme TMI'de degisiklik yapmadi", gizli turde | ayni goruntu |
| TBw (#330) STEP okuyucu ayri calisanda | STEP acilir; `unsafe-eval` yalniz `step-calisan.js` cevabinda; ana sayfada CSP ihlali yok | **DOGRULANDI**. Uydurma STEP (120x80x20) 3 sn'de okundu, 3B cizildi. Calisan: `vendor/occt/step-calisan.js`, cevap basligi `Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'`. `occt-import-js.js` ve `.wasm` cevabinda CSP basligi yok. CSP satiri: **0** (ilk turda ayni adimda 5) | `step/d_cam-2-step-yuklendi.png`, `step/d_cam-3-step-3b.png`, `step/konsol-d_cam.json` |
| TB2 (#332) bozuk ornek dugmeleri | Verisi olmayan ornek dugmesi gorunmez | **DOGRULANDI**. Cizim studyosunda yalniz "Is paketlerinden" listesi var, "Gomulu veri yok" hatasi veren ornek dugmesi yok | `step/d_cam-1-cizim-acildi.png` |
| T3 (#332) operatorde "Cizim studyosunu ac" | Kart yalniz `page.draw` iznine gorunur | **DOGRULANDI**. Ayarlar'da operator ve kalitede kart yok; CAM'de var | `ayarlar/d_operator-ayarlar.png`, `ayarlar/d_cam-ayarlar.png` |
| T4 (#332) metin | "TMI'ye bildirildi" | **DOGRULANDI**. Bitis ekrani "UE-000002 · TMI'YE BILDIRILDI" | `a/op11-05.png` |
| T5 (#332) adimsiz yayin | Ekranda yayin durur | **DOGRULANDI (ekran)**. Adimsiz pakette "Operasyon adimlari: En az bir adim" kirmizi, "Operatore gonder" pasif; sablondan 4 adim eklenince yayinlandi (5 pakette). Sunucunun 400 reddi tarayicidan denenmedi (ekran gondermiyor) | `a/cam-4-yayinla-adimsiz.png`, `a/cam-6-yayinlandi.png` |

## 2. Ilk turda denenmeyenler

| Konu | Kim | Sonuc | Kanit |
|---|---|---|---|
| Duraklat ve devam | d_operator | **DOGRULANDI**. TMI `durakli`, sonra `calisiyor`; kayit defterinde "Duraklatildi", "Devam edildi" | `a/op8-02.png`, `a/op9-02.png` |
| Durus (plansiz, ARIZA) | d_operator | **DOGRULANDI**. Basili tut > neden > kaydet; TMI `durdu`, neden "Ariza"; neden bakim cagrili oldugu icin "Bakim cagrildi" kendiliginden acildi | `a/op10-04.png` |
| Durus (planli, MOLA), 768 | d_operator | **DOGRULANDI**. UE-000004 defterinde "Durduruldu · Mola" | `dar/a/op768-07.png`, `dar/a/20-planlama-emir-4.png` |
| Cagri: bakim | d_operator > d_bakim | **DOGRULANDI**. Bakim sayfasi acikken bildirim geldi (SSE), "Ustlen" ile operatorde "Bakim alindi"; ariza kaydi acildi ve sebep, islem, parca ile kapatildi. Sayfa canli yenilenmiyor, bkz. Y6 | `cagri/d_bakim-3..8-*.png` |
| Cagri: kalite, vardiya amiri | d_operator > d_kalite, d_mudur | **DOGRULANDI**. Ikisinde de bildirim ve "Alindi" | `cagri/d_kalite-*.png`, `cagri/d_mudur-*.png` |
| Emir iptali | d_planlama | **TMI DOGRULANDI, Arkon BASARISIZ**. Planli emir TMI'de iptal edildi (yalniz planli emir iptal edilir). Arkon iptali bilmiyor, bkz. Y1 | `iptal/*.png`, `iptal/a/*.png` |
| Yazdirma: Raporlar "Yazdir / PDF" | d_mudur | **DOGRULANDI**. `window.print` cagrildi (bassiz tarayicida yazici penceresi acilmaz; cagri yakalandi) | `ciktilar/d_mudur-1280-raporlar.png` |
| Yazdirma: Kalite olcum raporu | d_kalite | **DOGRULANDI**. Yeni pencerede UE-000002 olcum raporu acildi ve `print` cagrildi | `ciktilar/d_kalite-olcum-raporu-penceresi.png` |
| CSV indirme | d_mudur | **DOGRULANDI**. 5 dosya indi (OEE, durus, hurda, istasyon, cagri), UTF-8 BOM, `;` ayracli | `ciktilar/inen-*.csv` |
| SVG indirme | d_cam | **DOGRULANDI**. STEP'ten uretilen teknik resim `deneme-parca-01-teknik-resim.svg` (6184 bayt) indi | `step/inen-deneme-parca-01-teknik-resim.svg` |
| QR (kamera) | d_operator | **DOGRULANDI**. Sahte kamera kaynagi Arkon'un kendi QR kutuphanesiyle uretilmis "UE-000004" goruntusunu verdi; pencere okudu, is acildi | `qr/qr-1..2-*.png` |
| QR (elle yazma, kamerasiz) | d_operator | **DOGRULANDI**. "Kamera acilamadi · kodu asagiya yazabilirsin"; UE-000005 yazilinca acildi; olmayan kodda "Bu kodla is emri yok" | `qr/qr-3..5-*.png` |
| QR uretme (markalama istasyonu) | - | **DENENEMEDI**. Markalama tipinde paket kurulmadi | - |
| 360 genislik | alti rol | **DOGRULANDI**. Ikinci menudeki her sayfa acildi, yatay tasma 0, konsol hatasi 0. Operator 360'ta ayar, kalite onayi, uretim, sayim (2 iyi, 1 hurda), duraklat, bitir yapti; TMI'ye yazildi | `roller/*-360-*.png`, `dar/a/op360*.png` |
| 768 genislik | alti rol | **DOGRULANDI**. Ayni olcum; operator 768'de uretim, MOLA durusu, yeniden baslat, duraklat, bitir yapti | `roller/*-768-*.png`, `dar/a/op768-*.png` |
| Yonetici olmayan roller | alti rol | **DOGRULANDI**, menu tablosu asagida | `roller/sonuc.jsonl` |

Rol basina Arkon ikinci menusu (768; 360 ayni). "OP" = sayfa kendi ekrani yerine operator ekranini aciyor.

| Rol | Kendi ekrani acilan sayfalar | Operator ekranina dusenler |
|---|---|---|
| mudur | Pano, Planlama, Kalite, Bakim, Raporlar, TMI'ye yazilamayanlar, Ayarlar | Hazirlik |
| planlama_proje | Pano, Planlama, Hazirlik, Kalite, Raporlar, TMI'ye yazilamayanlar, Ayarlar | Bakim |
| cam | Pano, Planlama, Hazirlik, Kalite, Cizim, Raporlar, Ayarlar | Bakim |
| kalite | Pano, Kalite, Raporlar, Ayarlar | Planlama, Hazirlik, Bakim |
| operator | Ayarlar | Pano, Planlama, Hazirlik, Kalite, Bakim, Raporlar |
| bakim | Pano, Bakim, Raporlar, Ayarlar | Planlama, Hazirlik, Kalite |

## 3. CSP (yalniz rapor kipi)

- Ana sayfa basligi degismedi: `Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'sha256-HchObSIgmzvVitImo07J4Dy9MdhTlS60iaE3XH+F1Ac=' 'sha256-TUh3poU/jZ43G0UCMPZKEVgI6K4bZdtegh1Pj29RidI=' 'wasm-unsafe-eval'; ... form-action 'none'; frame-ancestors 'self'`.
- Tur boyunca toplanan bütün konsol kayitlarinda (Akis A, cagri, iptal, raporlar, olcum raporu penceresi, QR, STEP, 12 rol x genislik kosusu) CSP ihlal satiri: **0**. `securitypolicyviolation` olayi da hic gelmedi.
- Zorlayici kipe gecis bu turda denenmedi (kullanici onayina bagli).

## 4. Yeni bulgular (Arkon yazarina)

- **Y1, kullanimi etkiler: iptal edilen emir Arkon'da yasiyor.** TMI'de iptal edilen UE-000003 Arkon'da kaldi; operator ayara gecti, kaliteye gonderdi, kalite onayladi, uretime gecti ve sayim yapti, ekranda hicbir uyari yok. TMI sayim ve durumu reddetti (gorunur satir: "Yalniz baslamis emirde sayim ve durus islemi yapilir"). CAM listesinde UE-000003 "URETIMDE", Arkon raporunda T01'de 1 iyi parca sayiliyor. `iptal/a/op-iptal2-03.png`, `roller/d_cam-768-arkon-hazirlik.png`.
- **Y2: sayfa yenilenince duraklatilmis is yeniden "CALISIYOR" gorunuyor.** TA1 ile UE-000001 duraklatildi (TMI `durakli`); Arkon sayfasi yeniden acilinca UE-000001 listede "CALISIYOR" (`a/op6-01.png`, `a/op7-04.png`). Ayrica yeniden acilista aktif is listenin ilk isi oluyor; o anda calisan is aktif olmadigindan baska is secmek duraklatmayi tetiklemedi (`a/op4-01.png`: UE-000002 secili, UE-000001 calisiyor). Bu yoldan ikinci is baslatilsaydi ilk turdaki A1 reddi tekrarlanirdi: VARSAYIM, denenmedi. Nedeni: `operator.ts` `saveResult` yalniz `isStationTablet()` iken kaydediyor; bu kurulumda istasyon tablet sayilmiyor olabilir: VARSAYIM.
- **Y3: TA2'nin kapsamadigi gorunur gurultu.** Durus suren iste her sayfa acilisi bir "Durus nedeni yok: TMI nedensiz durus kabul etmez" satiri birakti (4 satir, 16:00-16:03; durus TMI'de nedeniyle kayitli). Duraklatilmis iste acilis "Yalniz calisan is duraklatilir" reddi birakti (15:57:23). Mudur listesinde gercek sorun (iptal edilen emir) bunlarin arasinda.
- **Y4: durus ve hurda pencerelerinde Arkon'un kendi kodlari (D-01..D-12, H-01..H-07) TMI nedenleriyle yan yana.** Arkon kodu secilirse TMI'ye yazilmaz (ilk turdaki A3; durus icin de gecerli). `a/op9-02.png`.
- **Y5: otomatik duraklatma raporda plansiz durus.** Arkon raporunda "Nedeni girilmemis · Plansiz · 4 dk" var (`ciktilar/inen-rapor-02_10-08_10-durus.csv`). Kaynagi TA1 duraklatmasi (neden null) ya da elle duraklatma olabilir: VARSAYIM.
- **Y6: bakim sayfasi ustlenilen arizayi canli gostermiyor.** "Ustlen"den sonra "Acik · 0"; sayfa yenilenince ariza geliyor. `cagri/d_bakim-4-ustlenildi.png`, `cagri/d_bakim-6-bakim-yeniden.png`.
- **Y7: Arkon ikinci menusu her role 8-9 sayfa gosteriyor.** Yetkisi olmayan sayfa operator ekranina dusuyor (yukaridaki tablo; operatorde 6 sayfa). Ilk turdaki not, degismedi.
- **Y8 (bilinen, A5):** her paket degisikliginde `POST /arkon/kayitlar/audit/ekle` 400 ("Degisiklik gunlugunu yalniz sunucu yazar."); kayip yok, konsolda hata.

## 5. Denenemeyenler

- Android sarmalayici (ArkonAndroid) ve gercek tablet; Safari.
- Gercek bir CAD programindan cikmis STEP dosyasi (yalniz uydurma kutu).
- CSP zorlayici kip (kullanici onayina bagli).
- Sunucunun adimsiz yayina 400 donmesi (ekran istegi gondermiyor; birim testi #332'de).
- Mudurun "Yeniden dene" dugmesi (`hatali` satir olusmadi).
- Markalama istasyonunda QR uretme ve dogrulama; kalite RED akisi.
