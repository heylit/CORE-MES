# Tarayici denemesi: tam rapor, adim adim

Bu dosya yeni bir deneme degildir. 2026-10-08'deki iki kosunun kayitlarindan (betik ciktilari, ham JSON, ekran goruntuleri) adim adim yazildi.
Ozet ve bulgu numaralari `tarayici-denemesi.md` dosyasinda. Goruntu yollari bu dosyaya gore.

- **Ilk tur:** main `dd7fd6c`; klasor `tarayici-denemesi/ilk-tur-dd7fd6c/`. a, b, c, d, e, f kosuldu.
- **Son tur:** main `1a7892e` (#286, #287, #289 birlesmis); klasor `tarayici-denemesi/son-1a7892e/`. a (kisa), c, d, e, f kosuldu. b kosulmadi.
- **#290 birlesmemisti**, iki turda da yok.

Ortam: bulut kapsayicisi, Chromium + Playwright (depo disinda), 1280x800, yerel PostgreSQL 16, sunucu 4100, istemci 4101. Uygulamadan localhost disina istek: 0.
Kullanicilar uydurma: `d_mudur`, `d_planlama`, `d_kalite`, `d_cam`, `d_operator`, `d_bakim`, `d_satinalma`, `d_depo`, `d_ik`, `d_idari`, `d_finans`; kurulum ve tanim verisi `yonetici` ile API'den girildi.
Tanim verisi: is merkezleri IM-TOR, IM-FRZ; istasyonlar T01, T02, F01; makineler M01, M02; hurda nedeni "Olcu disi"; durus nedenleri ARIZA, MOLA; olcu aletleri KMP-001, MKR-001.

Sonuc sutunundaki isaret: **CALISTI**, **CALISMADI**, **KISMEN** (calisti ama beklenmeyen bir sey var), **BETIK** (sonuc betik hatasi; dogrusu goruntuden okundu).

## a) Akis A

### a.1 Ilk tur (dd7fd6c): iki emir, ayni istasyon (F01), is degistirme

Klasor `ilk-tur-dd7fd6c/a/`.

| # | Saat | Kim | Ne yapti | Sonuc | Goruntu |
|---|---|---|---|---|---|
| 1 | 10:27 | d_planlama | Uretim Emirleri > Emir ac: DENEME-PARCA-01 "Deneme flans", 20 adet, F01 | **CALISTI.** UE-000001 `planli`; konsol temiz | [form](tarayici-denemesi/ilk-tur-dd7fd6c/a/1-planlama-emir-formu.png), [acildi](tarayici-denemesi/ilk-tur-dd7fd6c/a/2-planlama-emir-acildi.png) |
| 2 | - | d_operator | Arkon'u acti (kesif) | Is listesi bos: "Bu istasyona atanmis is yok" (paket henuz yayinlanmamisti) | [acilis](tarayici-denemesi/ilk-tur-dd7fd6c/a/10-operator-acilis.png) |
| 3 | 10:29 | d_cam | Arkon > Hazirlik | **CALISTI.** UE-000001 taslak paket olarak kendiliginden geldi (V0, yayinlanmadi) | [hazirlik](tarayici-denemesi/ilk-tur-dd7fd6c/a/3-cam-hazirlik.png) |
| 4 | 10:29 | d_cam | Bilgiler sekmesi: operasyon bilgisi girildi | **CALISTI** | [bilgiler](tarayici-denemesi/ilk-tur-dd7fd6c/a/4-cam-bilgiler.png) |
| 5 | 10:29 | d_cam | Dokumanlar: deneme PDF ve STL eklendi | **CALISTI.** PDF goruntulendi | [dokumanlar](tarayici-denemesi/ilk-tur-dd7fd6c/a/5-cam-dokumanlar.png) |
| 6 | 10:30 | d_cam | Kontrol plani sekmesi | **CALISTI.** OCR 6 sn'de 3 olcu buldu (O20 H7, 80 h7, 120) | [kontrol plani](tarayici-denemesi/ilk-tur-dd7fd6c/a/6-cam-kontrol-plani.png) |
| 7 | 10:30 | d_cam | "3 noktayi ekle" | **CALISTI.** Kontrol 3 nokta | [noktalar](tarayici-denemesi/ilk-tur-dd7fd6c/a/7-cam-noktalar-eklendi.png) |
| 8 | 10:30 | d_cam | Yayinla sekmesi | **KISMEN.** Yayin oncesi kontrol: 4 madde tamam; "Operasyon adimlari: en az bir adim" uyarisi var, yayini durdurmuyor | [yayinla](tarayici-denemesi/ilk-tur-dd7fd6c/a/8-cam-yayinla-sekmesi.png) |
| 9 | 10:31 | d_cam | "Operatore gonder" | **KISMEN.** Paket V1 YAYINDA. Konsolda `POST /arkon/kayitlar/audit/ekle` 400 ("Degisiklik gunlugunu yalniz sunucu yazar.") | [yayinlandi](tarayici-denemesi/ilk-tur-dd7fd6c/a/9-cam-yayinlandi.png) |
| 10 | 10:32 | d_planlama | Ikinci emir: DENEME-PARCA-02 "Deneme burc", 20 adet, F01 | **CALISTI.** UE-000002 `planli` | [form](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-1-planlama-emir-formu.png), [acildi](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-2-planlama-emir-acildi.png) |
| 11 | 10:32 | d_cam | UE-000002 icin 4-9 tekrarlandi (OCR 7 sn, 3 olcu) | **KISMEN.** V1 YAYINDA; ayni 400 | [bilgiler](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-4-cam-bilgiler.png), [dokumanlar](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-5-cam-dokumanlar.png), [plan](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-6-cam-kontrol-plani.png), [noktalar](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-7-cam-noktalar-eklendi.png), [yayinla](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-8-cam-yayinla-sekmesi.png), [yayinlandi](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-9-cam-yayinlandi.png) |
| 12 | 10:33 | d_operator | Is listesinde UE-000001'i secti | **CALISTI.** Iki paket listede; teknik resim balonlarla, "KALITE ONAYLI" | [op1-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op1-01.png) |
| 13 | 10:33 | d_operator | "Isi Baslat" | **CALISTI (beklenen ret).** "Once ayar ve ilk parca kalite onayi gerekli" | [op1-02](tarayici-denemesi/ilk-tur-dd7fd6c/a/op1-02.png) |
| 14 | 10:34 | d_operator | UE-000001 > "Ayara gec" | **CALISTI.** Durum AYAR; "Parcayi al, kaliteye gonder · 3 olcu" | [op2-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op2-01.png), [op2-02](tarayici-denemesi/ilk-tur-dd7fd6c/a/op2-02.png) |
| 15 | 10:34 | d_operator | "Kaliteye gonder" | **CALISTI.** "Numune kalitede · onay gelince uretime gecebilirsin" | [op3-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op3-01.png), [op3-02](tarayici-denemesi/ilk-tur-dd7fd6c/a/op3-02.png) |
| 16 | 10:34 | d_kalite | Arkon > Kalite: numuneyi gordu, 20.010 / 79.985 / 120.02 girdi | **CALISTI.** "1 NUMUNE BEKLIYOR", uc olcu alani tolerans ipucuyla | [olculer](tarayici-denemesi/ilk-tur-dd7fd6c/a/kal2-olculer-girildi.png) |
| 17 | 10:34 | d_kalite | "Onayla" | **CALISTI.** "Onay makineye iletildi" | [onaylandi](tarayici-denemesi/ilk-tur-dd7fd6c/a/kal3-onaylandi.png) |
| 18 | 10:35 | d_operator | UE-000001 > "Uretime Gec" | **CALISTI.** TMI: UE-000001 `basladi` (10:35:22) | [op4-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op4-01.png), [op4-02](tarayici-denemesi/ilk-tur-dd7fd6c/a/op4-02.png) |
| 19 | 10:35 | d_operator | 5 kez "Iyi +1" | **CALISTI.** Sayac 5 | [op4-03](tarayici-denemesi/ilk-tur-dd7fd6c/a/op4-03.png) .. [op4-07](tarayici-denemesi/ilk-tur-dd7fd6c/a/op4-07.png) |
| 20 | 10:35 | d_operator | "Hurda +1" | **CALISTI.** Neden penceresi acildi: TMI nedenleri ve Arkon'un kendi kodlari (H-01..H-07) yan yana; betik pencereyi kapatmadan cikti | [op4-08](tarayici-denemesi/ilk-tur-dd7fd6c/a/op4-08.png) |
| 21 | 10:35 | d_operator | Yeniden: UE-000001 > "Hurda +1" > "Olcu disi" | **CALISTI.** TMI: saglam 5, hurda 1 | [op5-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op5-01.png), [op5-02](tarayici-denemesi/ilk-tur-dd7fd6c/a/op5-02.png), [op5-03](tarayici-denemesi/ilk-tur-dd7fd6c/a/op5-03.png) |
| 22 | 10:36 | d_operator | Baska ise gecti: UE-000002'yi secti | **CALISTI.** Aktif is UE-000002, "Ayara basla" | [op5-04](tarayici-denemesi/ilk-tur-dd7fd6c/a/op5-04.png) |
| 23 | 10:36 | d_operator | UE-000002 > "Ayara gec", sonra UE-000001'e geri dondu | **KISMEN.** UE-000002 AYAR; UE-000001 hala CALISIYOR (Arkon'da iki is ayni anda acik) | [op6-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op6-01.png), [op6-02](tarayici-denemesi/ilk-tur-dd7fd6c/a/op6-02.png), [op6-03](tarayici-denemesi/ilk-tur-dd7fd6c/a/op6-03.png) |
| 24 | 10:36 | d_operator | UE-000002 > "Kaliteye gonder" | **CALISTI** | [op7-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op7-01.png), [op7-02](tarayici-denemesi/ilk-tur-dd7fd6c/a/op7-02.png) |
| 25 | 10:36 | d_kalite | UE-000002 numunesini olctu, onayladi | **CALISTI.** "Tamamlanan · 2" | [olculer](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-kal2-olculer-girildi.png), [onaylandi](tarayici-denemesi/ilk-tur-dd7fd6c/a/e2-kal3-onaylandi.png) |
| 26 | 10:37 | d_operator | UE-000002 > "Uretime Gec", 2 kez "Iyi +1" | **CALISMADI (TMI tarafi).** Arkon'da UE-000002 ve UE-000001 ikisi de CALISIYOR, sayac 2. TMI: UE-000002 `planli`, baslama yok. Baslatma reddedildi: "Bu istasyonda baslamis bir is var; once onu bitirin." Iki sayim "bekliyor: Emir baslamadi" | [op8-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op8-01.png) .. [op8-04](tarayici-denemesi/ilk-tur-dd7fd6c/a/op8-04.png) |
| 27 | 10:37 | d_operator | UE-000001'e dondu, "Bitir" (basili tut) | **CALISTI.** TMI: UE-000001 `bitti` 10:37:34, saglam 5, hurda 1 | [op9-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op9-01.png), [op9-02](tarayici-denemesi/ilk-tur-dd7fd6c/a/op9-02.png) |
| 28 | 10:37 | d_planlama | UE-000001 ayrintisi | **CALISTI.** BITTI, saglam 5, hurda 1, "Emir adedinden 15 eksik"; kayit defteri: Baslatildi, Hurda +1 Olcu disi, Bitirildi 5 | [emir 1](tarayici-denemesi/ilk-tur-dd7fd6c/a/20-planlama-emir-1.png) |
| 29 | 10:37 | d_planlama | UE-000002 ayrintisi | **CALISMADI.** PLANLI, baslama yok, "Henuz kayit yok"; Arkon'da 2 parca sayilmisti | [emir 2](tarayici-denemesi/ilk-tur-dd7fd6c/a/20-planlama-emir-2.png), [liste](tarayici-denemesi/ilk-tur-dd7fd6c/a/21-planlama-emir-listesi.png) |
| 30 | 10:37 | d_mudur | Arkon > TMI'ye yazilamayanlar | **KISMEN.** Liste acildi (API 200, 23 satir): REDDEDILDI, BEKLIYOR, ESLENEMEDI satirlari; filtre (Hepsi, Bekliyor, Reddedildi, Eslenemedi, Hatali) var; "Yeniden dene" dugmesi yok | [liste](tarayici-denemesi/ilk-tur-dd7fd6c/a/22-mudur-tmiye-yazilamayanlar.png) |
| 31 | 10:38 | d_operator | Arkon sayfasini yeniden acti, UE-000002'yi secti | **CALISTI (gecikmeli).** TMI: UE-000002 `basladi` 10:38:26 (Arkon'da 10:37'de basladi); bekleyen 2 sayim yazildi | [op10-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op10-01.png) |
| 32 | 10:38 | d_operator | UE-000002 > "Bitir" (basili tut) | **CALISTI.** "Is emri tamamlandi", iyi 2, hurda 0. Bitis ekraninda "UE-000002 · ERP'YE BILDIRILDI" yaziyor | [op11-01](tarayici-denemesi/ilk-tur-dd7fd6c/a/op11-01.png), [op11-02](tarayici-denemesi/ilk-tur-dd7fd6c/a/op11-02.png) |
| 33 | 10:41 | (Arkon, operator oturumu, b adimi) | Operator Arkon'u b icin yeniden acti | **CALISMADI (yan etki).** Listeye yeni satir: "10:41:09 REDDEDILDI UE-000002 Yalniz baslamis emir bitirilir." (bitmis emir icin tekrar gonderim) | son turdaki liste goruntusunde |

### a.2 Son tur (1a7892e): tek emir, T01

Klasor `son-1a7892e/a/`, `s-` onekli.

| # | Saat | Kim | Ne yapti | Sonuc | Goruntu |
|---|---|---|---|---|---|
| 1 | 10:46 | d_planlama | Emir ac: DENEME-PARCA-03 "Deneme mil", 20 adet, T01 | **CALISTI.** UE-000003 `planli` | [form](tarayici-denemesi/son-1a7892e/a/s-1-planlama-emir-formu.png), [acildi](tarayici-denemesi/son-1a7892e/a/s-2-planlama-emir-acildi.png) |
| 2 | 10:47 | d_cam | Bilgiler, PDF + STL, kontrol plani (OCR 9 sn, 3 olcu), 3 nokta, Yayinla > Operatore gonder | **CALISTI.** TASLAK > YAYINDA | [bilgiler](tarayici-denemesi/son-1a7892e/a/s-4-cam-bilgiler.png), [dokumanlar](tarayici-denemesi/son-1a7892e/a/s-5-cam-dokumanlar.png), [plan](tarayici-denemesi/son-1a7892e/a/s-6-cam-kontrol-plani.png), [noktalar](tarayici-denemesi/son-1a7892e/a/s-7-cam-noktalar-eklendi.png), [yayinla](tarayici-denemesi/son-1a7892e/a/s-8-cam-yayinla-sekmesi.png), [yayinlandi](tarayici-denemesi/son-1a7892e/a/s-9-cam-yayinlandi.png) |
| 3 | 10:47 | d_operator | Istasyon secimi T01; UE-000003 > "Ayara gec" > "Kaliteye gonder" | **CALISTI.** Listeye 2 "ESLENEMEDI: setup icin TMI karsiligi yok" ve 1 "Emir calismiyordu; kuyruga alma TMI'de degisiklik yapmadi" satiri dustu | [s-op1-01](tarayici-denemesi/son-1a7892e/a/s-op1-01.png), [s-op1-02](tarayici-denemesi/son-1a7892e/a/s-op1-02.png), [s-op1-03](tarayici-denemesi/son-1a7892e/a/s-op1-03.png) |
| 4 | 10:48 | d_kalite | Olctu, onayladi | **CALISTI.** "Tamamlanan · 3" | [olculer](tarayici-denemesi/son-1a7892e/a/s-kal2-olculer-girildi.png), [onaylandi](tarayici-denemesi/son-1a7892e/a/s-kal3-onaylandi.png) |
| 5 | 10:48 | d_operator | "Uretime Gec", 3 kez "Iyi +1", "Hurda +1" > "Olcu disi", "Bitir" | **CALISTI.** TMI: UE-000003 `bitti`, baslama 10:48:19, bitis 10:48:31, saglam 3, hurda 1. Konsolda yalniz pdf.js uyarisi | [s-op2-01](tarayici-denemesi/son-1a7892e/a/s-op2-01.png) .. [s-op2-08](tarayici-denemesi/son-1a7892e/a/s-op2-08.png) |
| 6 | 10:48 | d_planlama | UE-000003 ayrintisi ve emir listesi | **CALISTI.** BITTI, 3 saglam, 1 hurda, "17 eksik"; kayit defteri tam | [emir 3](tarayici-denemesi/son-1a7892e/a/20-planlama-emir-3.png), [liste](tarayici-denemesi/son-1a7892e/a/s-21-planlama-emir-listesi.png) |
| 7 | 10:48 | d_mudur | TMI'ye yazilamayanlar | **KISMEN.** Liste acildi; bu tek emir 3 yeni satir ekledi (kayit no 36-38); "Yeniden dene" yok | [liste](tarayici-denemesi/son-1a7892e/a/s-22-mudur-tmiye-yazilamayanlar.png) |

## b) Teknik resim, cizim, 3B, OCR, CSP (yalniz ilk tur)

Klasor `ilk-tur-dd7fd6c/b/`. CSP satirlarinin aynen dokumu: [csp-satirlari.txt](tarayici-denemesi/csp-satirlari.txt).

| # | Saat | Kim | Ne yapti | Sonuc | CSP satiri | Goruntu |
|---|---|---|---|---|---|---|
| 1 | 10:39 | d_cam | Arkon > Cizim studyosu | **CALISTI.** Sol panelde is paketleri ve "Ornekler" listesi | yok | [01](tarayici-denemesi/ilk-tur-dd7fd6c/b/01-cizim-acildi.png) |
| 2 | 10:40 | d_cam | Deneme PDF ve STL birlikte eklendi | **CALISTI.** PDF acildi, OCR kendiliginden calisti: 3 olcu (O20 H7 %72, 80 h7 %92, 120 %92). Betik "olcu sayisi okunamadi" yazdi: **BETIK**, goruntude 3 olcu var | yok | [02](tarayici-denemesi/ilk-tur-dd7fd6c/b/02-pdf-ve-stl-eklendi.png) |
| 3 | 10:40 | d_cam | 3B model sekmesi (STL) | **CALISTI.** Model cizildi | yok | [03](tarayici-denemesi/ilk-tur-dd7fd6c/b/03-3b-model-sekmesi-stl.png) |
| 4 | 10:40 | d_cam | Tani sekmesi | **CALISTI** | yok | [04](tarayici-denemesi/ilk-tur-dd7fd6c/b/04-tani-sekmesi.png) |
| 5 | 10:40 | d_cam | PDF sekmesi > "Uygula" | **BETIK.** Dugme "Ayarlar uygulandi" olarak pasifti (ayar degismedigi icin); betik 30 sn bekleyip zaman asimina dustu. OCR paneli acik, 3 olcu | yok | [05](tarayici-denemesi/ilk-tur-dd7fd6c/b/05-pdf-sekmesi-uygula-ocr.png) |
| 6 | 10:40 | d_cam | Ad "DENEME-PARCA-01 Rev A", Kaydet | **CALISTI.** Betik "Kayitli rozeti gorunmedi" yazdi (**BETIK**: metin buyuk harf); sonraki goruntude "Kayitli cizimler · 1 DENEME-PARCA-01 Rev A PDF + STL" | yok | [06](tarayici-denemesi/ilk-tur-dd7fd6c/b/06-kaydet.png) |
| 7 | 10:40 | d_cam | "Yeni", sonra ornek "BRK-80.step" | **CALISMADI.** Sayfa hatasi `Gomulu veri yok: smp-step-brk`; orta alan bos kaldi. Ornek listesi (FLN-120, GVD-340 ailesi, BRK-80) gorunuyor | yok | [07](tarayici-denemesi/ilk-tur-dd7fd6c/b/07-ornek-step-3b.png) |
| 8 | 10:41 | d_operator | Arkon: teknik resim | **CALISTI.** Deneme resmi balonlarla | yok | [08](tarayici-denemesi/ilk-tur-dd7fd6c/b/08-operator-teknik-resim.png) |
| 9 | 10:41 | d_operator | 3B model sekmesi | **CALISTI.** STL modeli | yok | [09](tarayici-denemesi/ilk-tur-dd7fd6c/b/09-operator-3b-model.png) |
| 10 | 10:42 | d_cam | "Yeni", deneme STEP eklendi, 3B model | **KISMEN.** Model 6 sn'de cizildi; konsolda CSP ihlali | **5 satir** (asagida) | [10](tarayici-denemesi/ilk-tur-dd7fd6c/b/10-step-3b-model.png) |
| 11 | 10:42 | d_cam | Teknik resim (STEP'ten uretilen) | **CALISTI.** Modelden 4 olcu cikarildi (120, 80, 20, 20), antet dolu | 10'dakiler | [11](tarayici-denemesi/ilk-tur-dd7fd6c/b/11-step-modelden-teknik-resim.png) |
| 12 | a.1'de | d_cam | Hazirlik: PDF, STL, OCR, yayin | **CALISTI** | yok | a.1 adim 4-9 |
| 13 | a.1'de | d_kalite, d_operator | Kalite ve operator ekranlarinda teknik resim | **CALISTI** | yok | a.1 adim 12-17 |

STEP adimindaki konsol satiri (aynen; 5 kez):

```
[Report Only] Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: "script-src 'self' 'sha256-HchObSIgmzvVitImo07J4Dy9MdhTlS60iaE3XH+F1Ac=' 'sha256-yrObqbD96GFqtxVtv9rI3UVdtVyx3fUQDqcHDqGKkM0=' 'wasm-unsafe-eval'".
```

Ayni anda olay dinleyicisinden 5 kez: `CSP-OLAY report script-src eval http://localhost:4101/arkon-mes/vendor/occt/occt-import-js.js:9`.

Arkon'un gonderdigi baslik (`curl -I`, aynen):

```
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'sha256-HchObSIgmzvVitImo07J4Dy9MdhTlS60iaE3XH+F1Ac=' 'sha256-yrObqbD96GFqtxVtv9rI3UVdtVyx3fUQDqcHDqGKkM0=' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; media-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'
```

Ihlal listesinin tamami (bu denemede): PDF goruntuleme 0, OCR 0, STL 0, cizim studyosu (PDF ve STL ile) 0, Hazirlik 0, Kalite 0, operator ekrani 0, TMI kabugu 0, **STEP 3B 5 (unsafe-eval, occt-import-js.js:9)**.
CSP disi konsol satirlari: `Warning: Setting up fake worker.` (pdf.js), yazilim WebGL ve "GPU stall due to ReadPixels" uyarilari (basliksiz tarayicidan), React Router v7 uyarilari, a.1 adim 9'daki 400.

## c) Denetim ekrani

| # | Tur | Kim | Ne yapti | Sonuc | Goruntu |
|---|---|---|---|---|---|
| 1 | dd7fd6c | d_mudur | Menuye bakti, `/denetim` acti | **CALISMADI (o surumde beklenen).** Menude yok, "Sayfa bulunamadi". Liste ucu 200, govde ucu 403 | [mudur](tarayici-denemesi/ilk-tur-dd7fd6c/c/mudur-liste.png) |
| 2 | dd7fd6c | yonetici | Listeyi ve bir satiri acti | **CALISTI.** Liste ve govde 200 | [liste](tarayici-denemesi/ilk-tur-dd7fd6c/c/yonetici-liste.png), [ayrinti](tarayici-denemesi/ilk-tur-dd7fd6c/c/yonetici-ayrinti.png) |
| 3 | dd7fd6c | d_operator | `/denetim` acti | **CALISTI (beklenen ret).** Menude yok, sayfa yok, iki uc 403 | [operator](tarayici-denemesi/ilk-tur-dd7fd6c/c/operator-liste.png) |
| 4 | 1a7892e | d_mudur | Menuden Denetim | **CALISTI.** Menude var; liste: kisi, tarih ve islem suzgecleri; satir alanlari `id, zaman, kisiId, kisiAd, yontem, yol, kimlikler` (govde yok) | [liste](tarayici-denemesi/son-1a7892e/c/mudur-liste.png) |
| 5 | 1a7892e | d_mudur | Satira tikladi | **CALISTI.** "Icerik gorme yetkiniz yok."; govde ucu 403 (konsolda 403 satiri) | [ayrinti](tarayici-denemesi/son-1a7892e/c/mudur-ayrinti.png) |
| 6 | 1a7892e | yonetici | Liste ve satir ayrintisi | **CALISTI.** Parametre ve govde; parola `[gizli]` | [liste](tarayici-denemesi/son-1a7892e/c/yonetici-liste.png), [ayrinti](tarayici-denemesi/son-1a7892e/c/yonetici-ayrinti.png) |
| 7 | 1a7892e | d_operator | `/denetim` acti | **CALISTI (beklenen ret).** "Sayfa bulunamadi · Aradiginiz sayfa yok ya da yetkiniz yok"; iki uc 403 | [operator](tarayici-denemesi/son-1a7892e/c/operator-liste.png) |
| 8 | 1a7892e | (gozlem) | Liste icerigi | **KISMEN.** Ilk sayfanin cogu "Oturumsuz POST /oturum/giris" satiri; her giris denemesi bir satir | yukaridaki listeler |

## d) Arkon Ayarlar > Kisiler, operatorle

| # | Tur | Kim | Ne yapti | Sonuc | Goruntu |
|---|---|---|---|---|---|
| 1 | iki tur | d_operator | Arkon > Ayarlar | **KISMEN.** Yalniz "Genel" sekmesi; Kisiler, Tesis, Uretim, Sistem yok. Genel: hesap (ad, Cikis), Baglanti (sunucu adresi duzenlenebilir, "Kaydet ve baglan", "Baglantiyi dene"), ekran modulu anahtarlari, "Cizim studyosunu ac" | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/d/1-ayarlar.png), [son](tarayici-denemesi/son-1a7892e/d/1-ayarlar.png) |
| 2 | dd7fd6c | d_operator | Sunucu adresi alani | **CALISMADI (guvenlik).** Alan pasif degil (`isDisabled` = false) | ilk/1-ayarlar |
| 3 | dd7fd6c | d_operator | `GET /arkon/kisiler` (oturum cerezi ile) | **CALISMADI (yetki).** 200; 7 kisi: ad, Arkon rolu (admin, lead, plan, prep, quality, maint, operator), is merkezleri, aktif | - |
| 4 | dd7fd6c | d_operator | `GET /arkon/ben` | **CALISTI.** 200, yalniz kendisi | - |
| 5 | dd7fd6c | d_operator | "Cizim studyosunu ac" | **CALISMADI.** Studyo acilmadi; operator ekranina dondu | [3](tarayici-denemesi/ilk-tur-dd7fd6c/d/3-cizim-studyosu-operator.png) |

## e) Ikinci menu daraltma ve tam ekran (1280x800)

Iki turda olculer ayni; ham veri `e/e.json`.

| # | Kim, sayfa | Ne yapti | Sonuc | Goruntu (son tur) |
|---|---|---|---|---|
| 1 | d_operator /arkon | Acilis | **CALISTI.** Ikinci menu dar (72 px), cerceve 1136x744, zoom 0.67 | [1](tarayici-denemesi/son-1a7892e/e/d_operator_arkon-1-acilis.png) |
| 2 | d_operator /arkon | Daraltma dugmesi 1. tik | **CALISTI.** Menu 248 px, cerceve 960, zoom 0.57; dugme etiketi "Menuyu daralt" | [2](tarayici-denemesi/son-1a7892e/e/d_operator_arkon-2-daralt-tik1.png) |
| 3 | d_operator /arkon | 2. tik | **CALISTI.** 72 px, 1136, 0.67; etiket "Menuyu genislet" | [3](tarayici-denemesi/son-1a7892e/e/d_operator_arkon-3-daralt-tik2.png) |
| 4 | d_operator /arkon | Tam ekran | **KISMEN.** Ray ve menu gizli, cerceve 1280x744, zoom 0.76; ust baslik (56 px) kaliyor; tarayicinin gercek tam ekrani degil | [4](tarayici-denemesi/son-1a7892e/e/d_operator_arkon-4-tam-ekran.png) |
| 5 | d_operator /arkon | Esc | **CALISTI.** Acilis haline dondu | [5](tarayici-denemesi/son-1a7892e/e/d_operator_arkon-5-esc.png) |
| 6 | d_operator /arkon | Sayfayi yeniden yukledi | **CALISTI.** Dar kaldi | e.json |
| 7 | d_cam /arkon/hazirlik | 1-6 ayni sira | **CALISTI.** Sayilar operatorle ayni | [1](tarayici-denemesi/son-1a7892e/e/d_cam_arkon_hazirlik-1-acilis.png), [2](tarayici-denemesi/son-1a7892e/e/d_cam_arkon_hazirlik-2-daralt-tik1.png), [3](tarayici-denemesi/son-1a7892e/e/d_cam_arkon_hazirlik-3-daralt-tik2.png), [4](tarayici-denemesi/son-1a7892e/e/d_cam_arkon_hazirlik-4-tam-ekran.png), [5](tarayici-denemesi/son-1a7892e/e/d_cam_arkon_hazirlik-5-esc.png) |
| 8 | d_planlama /malzemeler | 1-6 ayni sira | **KISMEN.** Genislikler ayni (1136 / 960 / 1136 / 1280); cerceve her durumda 632 px yuksek, altta 112 px bos | [1](tarayici-denemesi/son-1a7892e/e/d_planlama_malzemeler-1-acilis.png), [2](tarayici-denemesi/son-1a7892e/e/d_planlama_malzemeler-2-daralt-tik1.png), [3](tarayici-denemesi/son-1a7892e/e/d_planlama_malzemeler-3-daralt-tik2.png), [4](tarayici-denemesi/son-1a7892e/e/d_planlama_malzemeler-4-tam-ekran.png), [5](tarayici-denemesi/son-1a7892e/e/d_planlama_malzemeler-5-esc.png) |

## f) Rol basina menu (11 rol)

Her rol girdi, ana menuyu ve ikinci menuyu okudu; `kurulum/yetki-matrisi.md` ile karsilastirildi. Ham veri `f/menu.json`.

| # | Kim | Menude gorunen (1a7892e) | Matrisle fark | Goruntu (ilk / son) |
|---|---|---|---|---|
| 1 | d_mudur | uretim-emirleri, arkon, kuyruk, cizelge, matris, vardiya, mesai, stok, malzemeler, kalibrasyon, rota, istasyonlar, personel, denetim | yok (kalibrasyon ve denetim dd7fd6c'de yoktu; o surumde de matrisle ayniydi) | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/mudur-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/mudur-menu.png) |
| 2 | d_planlama | uretim-emirleri, arkon, kuyruk, cizelge, matris, vardiya, mesai, stok, malzemeler, rota, istasyonlar | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/planlama-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/planlama-menu.png) |
| 3 | d_kalite | uretim-emirleri, arkon, stok, malzemeler, kalibrasyon, rota | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/kalite-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/kalite-menu.png) |
| 4 | d_cam | uretim-emirleri, arkon, malzemeler, rota, istasyonlar | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/cam-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/cam-menu.png) |
| 5 | d_operator | arkon, kuyruk, malzemeler | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/operator-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/operator-menu.png) |
| 6 | d_bakim | arkon | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/bakim-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/bakim-menu.png) |
| 7 | d_satinalma | stok, malzemeler | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/satinalma-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/satinalma-menu.png) |
| 8 | d_depo | stok, malzemeler | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/depo-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/depo-menu.png) |
| 9 | d_ik | vardiya, mesai, personel | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/ik-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/ik-menu.png) |
| 10 | d_idari | vardiya, mesai, personel | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/idari-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/idari-menu.png) |
| 11 | d_finans | uretim-emirleri, stok | yok | [ilk](tarayici-denemesi/ilk-tur-dd7fd6c/f/finans-menu.png) / [son](tarayici-denemesi/son-1a7892e/f/finans-menu.png) |

Sunucunun `/oturum` ile verdigi islemler de 11 rolde matrisle ayni. Matrise uygun ama dikkat ceken: Satin Alma sayfasi hicbir rolde yok; Arkon ikinci menusundeki `sayfa.arkon` bolumleri (Pano, Planlama, Hazirlik, Kalite, Raporlar, Ayarlar) Arkon'a giren herkese gorunuyor; Malzemelerde "Malzeme ayarlari" operatore de gorunuyor.

## Calisan ve calismayan her sey, tek liste

Kullanicinin ele aldigi alti madde **[madde]** ile isaretli; gerisi bu raporda ilk kez ayrica listeleniyor.

Calismayan ya da sorunlu:
1. **[TA1]** Ayni istasyonda ise gecince ikinci emir TMI'de baslamiyor; Arkon sayfasi yeniden acilana kadar `planli` kaliyor, baslama zamani gec (a.1 adim 26, 29, 31).
2. **[TA2]** TMI'ye yazilamayanlar listesi beklenen durumlarla doluyor: setup eslenemedi, "is zaten calisiyor", kuyruga alma (a.1 adim 30, a.2 adim 3, 7).
3. **[TB]** STEP acilisinda `unsafe-eval` CSP ihlali, 5 satir (b adim 10).
4. **[TB2]** Cizim studyosu ornek dosya dugmeleri: `Gomulu veri yok: smp-step-brk` (b adim 7).
5. **[TD]** Operator Arkon sunucu adresini degistirebiliyor (d adim 2).
6. **[d]** `GET /arkon/kisiler` operatore 200, 7 kisiyi rolleriyle veriyor (d adim 3).
7. Arkon iki isin ayni istasyonda ayni anda CALISIYOR olmasina izin veriyor; TMI vermiyor (a.1 adim 23, 26).
8. Bitmis emir icin Arkon tekrar "bitir" gonderiyor ve listeye ret satiri dusuyor (a.1 adim 33).
9. Mudurun listesinde "Yeniden dene" dugmesi yok; reddedilen ya da bekleyen satir icin elle yeniden deneme yok (a.1 adim 30).
10. Hurda nedeni penceresinde Arkon'un kendi kodlari (H-01..H-07) TMI nedenleriyle yan yana; secilirse TMI'ye yazilmaz (a.1 adim 20).
11. Her degisiklikte `POST /arkon/kayitlar/audit/ekle` 400; kayip yok, konsolda hata (a.1 adim 9, 11).
12. Operatorde "Cizim studyosunu ac" studyoyu acmiyor, operator ekranina donuyor (d adim 5).
13. Bitis ekraninda "ERP'YE BILDIRILDI" yaziyor; bildirilen yer TMI (a.1 adim 32). Metin bulgusu.
14. Tam ekran sayfa ici; ust baslik kaliyor; 1280'de Arkon zoom en cok 0.76, yazi kucuk (e adim 4).
15. Malzemeler cercevesi 632 px; altta 112 px bos (e adim 8).
16. Denetim listesinin ilk sayfasi "Oturumsuz POST /oturum/giris" satirlariyla doluyor (c adim 8).
17. Yayin oncesi kontrolde "en az bir adim" uyarisi var ama yayini durdurmuyor; adimsiz paket yayinlaniyor (a.1 adim 8).

Calisan:
- Emir acma, emir listesi ve emir ayrintisi (saglam, hurda, eksik adet, kayit defteri).
- Taslak paketin TMI emrinden kendiliginden gelmesi; Bilgiler, Dokumanlar, PDF goruntuleme, OCR (6-9 sn, 3 olcu), kontrol plani, yayin.
- Ayar, ilk parca numunesi, kalite olcumu ve onayi; onaysiz baslatmanin engellenmesi.
- Tek emirde baslat, iyi sayimi, hurda (TMI nedeniyle), bitir; TMI'ye dogru yaziliyor (son turda bastan sona).
- Cizim studyosu: PDF + STL ekleme, OCR, 3B (STL ve STEP), STEP'ten teknik resim ve 4 olcu, kaydetme.
- Operator ekraninda teknik resim ve 3B model.
- Denetim: mudur liste evet icerik hayir, yonetici ikisi, operator hic (1a7892e); parola `[gizli]`.
- Operator Arkon Ayarlar'da yalniz Genel sekmesini goruyor.
- Ikinci menu daraltma, etiket, hatirlama; tam ekran ve Esc.
- 11 rolun menusu ve sunucu islemleri matrisle ayni.

## Denenmeyenler

- #290 birlesmemisti.
- b son turda (1a7892e) kosulmadi. VARSAYIM: #286, #287, #289 Arkon derlemesine dokunmuyor.
- Yalniz Chromium 1280x800. Tablet, dokunmatik, Safari, 360 ve 768 genislik bu denemede yok (genislikler `ekran-olcumu.md`'de).
- Tarayicinin gercek tam ekrani (Fullscreen API) basliksiz tarayicida denenmedi.
- "Yeniden dene" akisi: `hatali` satir olusmadi.
- Duraklat, durdur, durus nedeni, cagri, malzeme teslim ve istasyon degistirme denenmedi.
- Bakim, satin alma, depo, IK, idari ve finans rolleri yalniz menu icin denendi.
- Uretim emri iptali denenmedi.
- Operator sunucu adresini gercekten baska yere yonlendirip kaydetme denenmedi; yalniz alanin acik oldugu goruldu.
