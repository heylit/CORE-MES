# Tarayici denemesi: yonetici olmayan rollerle (salt okuma)

Tarih 2026-10-08. Depo heylit/TMICOREV2. Depoda dosya degismedi, commit ve dal yok, package.json dokunulmadi.

- **Ilk tur:** main `dd7fd6c` (#291 ve #292 icinde; #286, #287, #289 henuz yoktu): a, b, c, d, e, f.
- **Son tur:** main `1a7892e` (#286, #287, #289 birlesmis): f, c, d, e ve kisa bir Akis A tekrarlandi. b ilk turda kaldi; bu uc birlesme Arkon derlemesine dokunmuyor (VARSAYIM: commit adlari kisiler, denetim ve rol satirlari).
- **#290 birlesmemisti** (acik); bu denemeye girmedi.

Ortam: bulut kapsayicisi, Node 24.21, PostgreSQL 16 yerel, `npm ci`, `npm run goc`, `npm run derle:arkon`, sunucu 4100, istemci 4101.
Tarayici: kapsayicida kurulu Chromium + Playwright (depo disinda, `/opt`), 1280x800. Uygulamadan localhost disina giden istek: 0 (betik hepsini yakalayip sayiyor).

Deneme verisi uydurmadir. Her role bir hesap acildi (`d_mudur`, `d_planlama`, `d_kalite`, `d_cam`, `d_operator`, `d_bakim`, `d_satinalma`, `d_depo`, `d_ik`, `d_idari`, `d_finans`; parola deneme degeri). Parcalar `DENEME-PARCA-01..03`.
Teknik resim betikle cizilmis bir PDF'tir: kutu, iki delik ve dort olcu. 3B model betikle uretilmis 120x80x20 kutudur (STL ve STEP).
Ornek dosyalar `tarayici-denemesi/deneme-dosyalari/` altinda.

## Sonuc

| Adim | Sonuc |
|---|---|
| a) Akis A | **Calisiyor.** Emir acma, CAM yayini, kalite onayi, baslat, sayim, hurda ve bitis TMI emrine yazildi. Ayni istasyonda ikinci ise gecince ikinci emir TMI'de takiliyor; operator Arkon sayfasini yeniden acana kadar acilmiyor. |
| b) PDF, cizim, 3B, OCR | **Calisiyor.** PDF, OCR (3 olcu), STL ve STEP 3B calisti. **CSP:** yalniz STEP okuyucuda `unsafe-eval` ihlali var (5 satir, `occt-import-js.js:9`); PDF, OCR, STL ve operator ekraninda CSP satiri yok. Cizim studyosundaki ornek dosya dugmeleri hata veriyor. |
| c) Denetim ekrani (1a7892e) | **Beklendigi gibi.** Mudur listeyi goruyor, icerikte "Icerik gorme yetkiniz yok" yaziyor, govde ucu 403. Yonetici ikisini de goruyor, parola `[gizli]`. Operator sayfayi goremiyor, iki uc da 403. Liste cevabinda govde alani yok. |
| d) Arkon Ayarlar > Kisiler (operator) | Operatorde **Kisiler sekmesi yok**, yalniz "Genel" var. Ama `GET /arkon/kisiler` operatore 200 donuyor ve 7 kisinin adini ve Arkon rolunu veriyor. Operator sunucu adresini degistirebiliyor. |
| e) Daraltma ve tam ekran (1280) | **Calisiyor.** Cerceveli sayfada ikinci menu dar acilir (72 px). Arkon cercevesi 1136 px, zoom 0.67 (onceki olcumde 0.57). Tam ekranda 1280 px, zoom 0.76; Esc ile cikiliyor. Malzemeler cercevesi asagida 112 px bos birakiyor. |
| f) Rol menuleri (11 rol) | **11 rolun hepsi `kurulum/yetki-matrisi.md` ile birebir ayni**, iki turda da; fazla ya da eksik sayfa yok. Sunucunun verdigi islemler de matrisle ayni. Satin alma rolu Satin Alma sayfasini gormuyor; matris boyle. |

## a) Akis A (ayrinti)

Klasor: `ilk-tur-dd7fd6c/a/` (iki emir, ise gecis) ve `son-1a7892e/a/` (`s-` onekli, tek emir).

| # | Kim | Ne yapti | Sonuc | Goruntu |
|---|---|---|---|---|
| 1 | d_planlama | Uretim Emirleri > Emir ac: DENEME-PARCA-01, 20 adet, F01 | UE-000001 `planli` | `1-planlama-emir-formu.png`, `2-...acildi.png` |
| 2 | d_cam | Arkon > Hazirlik: `UE-000001` taslagi hazir geldi. Operasyon girildi, PDF ve STL eklendi; kontrol planinda OCR 3 olcu onerdi, 3 nokta eklendi | Yayin oncesi kontrol gecti (adim listesi bos: "en az bir adim" uyarisi, yayini durdurmuyor) | `4-`..`8-cam-*.png` |
| 3 | d_cam | Operatore gonder | Paket V1 YAYINDA | `9-cam-yayinlandi.png` |
| 4 | d_operator | Arkon: is listesinde iki paket; UE-000001 > Ayara gec > Kaliteye gonder | Ayar ve ilk parca onayi zorunlu (paket kurali) | `op2-*.png`, `op3-*.png` |
| 5 | d_kalite | Arkon > Kalite: numune geldi, uc olcu girildi, Onayla | "Onay makineye iletildi" | `kal2-`, `kal3-*.png` |
| 6 | d_operator | Uretime gec, 5 kez Iyi +1, Hurda +1 > "Olcu disi" | TMI: `basladi`, saglam 5, hurda 1 | `op4-*.png`, `op5-*.png` |
| 7 | d_operator | Baska ise gecti: UE-000002 > Ayara gec > kalite onayi > Uretime gec > 2 kez Iyi +1 | Arkon'da iki is ayni anda CALISIYOR. TMI UE-000002'nin baslatilmasini reddetti ("Bu istasyonda baslamis bir is var; once onu bitirin"); sayimlar "bekliyor" | `op6-`..`op8-*.png` |
| 8 | d_operator | UE-000001'e dondu, Bitir (basili tut) | TMI: UE-000001 `bitti`, saglam 5, hurda 1, kayit defteri dolu | `op9-*.png` |
| 9 | d_planlama | Emir ayrintisi | UE-000001 BITTI, 5 saglam, 1 hurda, "Emir adedinden 15 eksik". UE-000002 PLANLI, kayit yok | `20-planlama-emir-1.png`, `-2.png` |
| 10 | d_operator | Arkon sayfasini yeniden acti | UE-000002 o anda baslatildi (10:38; Arkon'daki baslangic 10:37). Bekleyen 2 sayim yazildi; sonra bitirildi | `op10-*.png`, `op11-*.png` |
| 11 | d_mudur | Arkon > TMI'ye yazilamayanlar | Liste acildi (200), satirlar goruluyor; ekranda "Yeniden dene" dugmesi yok | `22-mudur-tmiye-yazilamayanlar.png` |
| 12 | (son tur, 1a7892e) | Planlama emir acti (T01), CAM yayinladi, operator ayar, kalite onay, 3 iyi, 1 hurda, bitir; planlama emri gordu; mudur listeyi acti | Hepsi calisti: UE-000003 `bitti`, saglam 3, hurda 1 | `son-1a7892e/a/s-*.png` |

Akis A bulgulari:
- **A1, kullanimi etkiler:** Ayni istasyonda ise gecince ikinci emrin baslangici TMI'de reddediliyor ve yeniden denenmiyor. Emir, operator Arkon sayfasini yeniden acip durum tekrar gonderilene kadar `planli` kaliyor; baslama zamani da gec yaziliyor. Arkon iki isin ayni anda calismasina izin veriyor, TMI vermiyor. Bilinen sinir: `arkon/UYUM-BORCU.md` sinir d.
- **A2:** Liste olagan akistaki satirlarla doluyor. Her "Ayara gec" bir "esleneMEDI: setup" satiri, her sayfa acilisi bir "is zaten calisiyor" reddi uretiyor. Uc emirde 30 satir birikti, gercek sorun bunlarin arasinda kayboluyor.
- **A3:** Hurda nedeni penceresinde Arkon'un kendi kodlari (H-01..H-07) TMI'nin nedenleriyle yan yana duruyor. H-01 secilirse TMI'ye yazilmaz; bilinen kural (`UYUM-BORCU.md` eslenemeyenler). Denemede TMI'deki "Olcu disi" secildi.
- **A4:** Mudurun listesinde "Yeniden dene" dugmesi yok. Dugme yalniz `hatali` satirda ve N2'nin islemiyle gorunur; bu denemede `hatali` satir olusmadi, reddedilen satir icin yeniden deneme yok.
- **A5:** Ekran, her degisiklikte istemciden `POST /arkon/kayitlar/audit/ekle` gonderiyor ve 400 aliyor ("Degisiklik gunlugunu yalniz sunucu yazar."). Kayip yok, konsolda hata gorunuyor. Bilinen: `UYUM-BORCU.md` satir 89.

## b) Teknik resim, cizim, 3B, OCR ve CSP

Klasor: `ilk-tur-dd7fd6c/b/`. Satirlarin aynen dokumu `tarayici-denemesi/csp-satirlari.txt` dosyasinda.

| # | Kim | Ne yapti | Sonuc | Goruntu |
|---|---|---|---|---|
| 1 | d_cam | Cizim studyosu: PDF ve STL birlikte eklendi | PDF acildi; OCR 3 olcu buldu (O20 H7 %72, 80 h7 %92, 120 %92) | `02-`, `03-*.png` |
| 2 | d_cam | 3B model sekmesi (STL) | Model cizildi (1 canvas) | `03-3b-model-sekmesi-stl.png` |
| 3 | d_cam | Kaydet ("DENEME-PARCA-01 Rev A") | "kaydedildi · Hazirlik > Dokumanlar'da hazir" | `06-kaydet.png` |
| 4 | d_cam | Ornek "BRK-80.step" dugmesi | **Hata:** `Gomulu veri yok: smp-step-brk` (sayfa hatasi). Ornek dosyalar derlemede yok, dugmeler gorunuyor | `07-ornek-step-3b.png` |
| 5 | d_cam | Uydurma STEP eklendi, 3B model | Model cizildi; modelden 4 olcu cikarildi. **CSP satiri cikti** (asagida) | `10-step-3b-model.png` |
| 6 | d_operator | Arkon: teknik resim ve 3B model sekmesi | Deneme resmi ve STL modeli gorundu | `08-`, `09-operator-*.png` |
| 7 | d_cam (Akis A, Hazirlik) | PDF ve STL yukleme, OCR, yayin | Calisti; CSP satiri yok | `ilk-tur-dd7fd6c/a/4-..9-*.png` |

Konsoldaki CSP satirlari (Arkon sayfasi `Content-Security-Policy-Report-Only` ile geliyor; basligi `curl -I` ile dogruladim):

```
[Report Only] Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: "script-src 'self' 'sha256-HchObSIgmzvVitImo07J4Dy9MdhTlS60iaE3XH+F1Ac=' 'sha256-yrObqbD96GFqtxVtv9rI3UVdtVyx3fUQDqcHDqGKkM0=' 'wasm-unsafe-eval'".
```

- Bu satir STEP acilisinda 5 kez geldi.
- Ayni anda `securitypolicyviolation` olayi da 5 kez geldi: `report script-src eval http://localhost:4101/arkon-mes/vendor/occt/occt-import-js.js:9`.
- PDF goruntuleme, OCR, STL, Hazirlik, Kalite, operator ekrani ve TMI kabugu: 330 konsol satirinda CSP satiri **0**.

Sonuc: ilke `enforce` edilirse STEP okuyucu (occt-import-js) kirilir. PDF, OCR ve STL bugunku ilkeyle calisir. `csp-satirlari.txt` dosyasi, CSP-OLAY dinleyicisinin henuz eklenmedigi ilk Hazirlik kosularini da sayar; o kosularda report-only konsol satiri da yok.

Konsolda CSP disi diger satirlar:
- `Warning: Setting up fake worker.` (pdf.js)
- yazilim WebGL uyarisi (basliksiz tarayicidan)
- React Router v7 uyarilari
- A5'teki 400

## c) Denetim ekrani

Son tur `son-1a7892e/c/`; ilk tur `ilk-tur-dd7fd6c/c/`.

| Kim | Menude | Sayfa | `GET /denetim-kayitlari` | Satira tikla | `GET .../:id/govde` |
|---|---|---|---|---|---|
| d_mudur (dd7fd6c) | yok | "Sayfa bulunamadi" | 200 | - | 403 |
| d_mudur (1a7892e) | var | liste | 200; satir alanlari `id, zaman, kisiId, kisiAd, yontem, yol, kimlikler` (govde yok) | "Icerik gorme yetkiniz yok." | 403 |
| yonetici | var | liste | 200 | Parametreler ve govde; `{"parola":"[gizli]","kullaniciAdi":"yonetici"}` | 200 |
| d_operator | yok | "Sayfa bulunamadi" | 403 | - | 403 |

Goruntuler: `mudur-liste.png`, `mudur-ayrinti.png`, `yonetici-ayrinti.png`, `operator-liste.png`.
Yan bulgu: her giris denemesi "Oturumsuz POST /oturum/giris" satiri yaziyor; denemede liste cogunlukla bunlardan olustu.

## d) Arkon Ayarlar > Kisiler, operatorle

Iki turda ayni. Klasor `.../d/`.

| Ne | Sonuc |
|---|---|
| Ayarlar sekmeleri | Yalniz "Genel". Kisiler, Tesis, Uretim, Sistem sekmeleri yok |
| Genel'de gorunen | Hesap (kendi adi, Cikis); Baglanti: sunucu adresi **duzenlenebilir**, "Kaydet ve baglan" ve "Baglantiyi dene" dugmeleri var; ekran modulu anahtarlari ("yalniz bu cihazda gecerlidir"); "Cizim studyosunu ac" (tiklayinca operator ekranina doner, studyo acilmiyor) |
| `GET /arkon/kisiler` (operator oturumu) | **200**, 7 kisi: ad, Arkon rolu (admin, lead, plan, prep, quality, maint, operator), is merkezleri |
| `GET /arkon/ben` | 200, yalniz kendisi |

`/arkon/kisiler` operatore acik. Bu N3 listesinin konusu, orada degerlendirilecek. Ekran listeyi gostermiyor; uc veriyi donuyor.

## e) Ikinci menu daraltma ve tam ekran (1280x800)

Iki turda ayni sayilar. Klasor `.../e/`. Arkon zoom'u `min(W/(1600+ray), H/900)` ile hesaplaniyor.

| Kim, sayfa | Acilis | Menuyu genislet | Tekrar daralt | Tam ekran | Esc | Yeniden yukle |
|---|---|---|---|---|---|---|
| d_operator /arkon | ikinci menu 72, cerceve 1136, zoom 0.67 | 248, cerceve 960, zoom 0.57 | 72, 1136, 0.67 | ray ve menu gizli, cerceve 1280, zoom 0.76; ust baslik (56 px) kaliyor | acilis haline dondu | dar kaldi |
| d_cam /arkon/hazirlik | ayni | ayni | ayni | ayni | ayni | ayni |
| d_planlama /malzemeler | 72, cerceve 1136x632 | 960x632 | 1136x632 | 1280x632 | geri dondu | dar kaldi |

- Daraltma dugmesinin etiketi dogru degisiyor ("Menuyu genislet" / "Menuyu daralt").
- Tam ekran tarayicinin Fullscreen API'sini kullanmiyor; sayfa ici gorunum (`document.fullscreenElement` bos). Ust baslik kaliyor.
- **E1:** 1280'de tam ekranda bile Arkon zoom 0.76. Arkon 1600 px'lik masaustu duzeni icin tasarlanmis; 1280 ekranda metin ve dugmeler yine kucuk.
- **E2:** Malzemeler cercevesi 632 px yuksek; altta 112 px bos kaliyor. Onceki olcumdeki B4 suruyor.

## f) Rol basina menu (11 rol)

Klasor `.../f/` (`menu.json`, rol basina `*-menu.png`). Beklenen deger `kurulum/yetki-matrisi.md`'den okundu. Terminal `menudeGizli` oldugu icin karsilastirmaya girmedi.

| Rol | Menude gorunen (1a7892e) | Matrisle fark |
|---|---|---|
| mudur | uretim-emirleri, arkon, kuyruk, cizelge, matris, vardiya, mesai, stok, malzemeler, **kalibrasyon**, rota, istasyonlar, personel, **denetim** | yok |
| planlama_proje | uretim-emirleri, arkon, kuyruk, cizelge, matris, vardiya, mesai, stok, malzemeler, rota, istasyonlar | yok |
| kalite | uretim-emirleri, arkon, stok, malzemeler, **kalibrasyon**, rota | yok |
| cam | uretim-emirleri, arkon, malzemeler, rota, istasyonlar | yok |
| operator | arkon, kuyruk, malzemeler | yok |
| bakim | arkon | yok |
| satin_alma | stok, malzemeler | yok |
| depo | stok, malzemeler | yok |
| insan_kaynaklari | vardiya, mesai, personel | yok |
| idari_isler | vardiya, mesai, personel | yok |
| muhasebe_finans | uretim-emirleri, stok | yok |

Kalin yazilanlar `dd7fd6c`'de yoktu; #287 ile geldi.
Sunucunun `/oturum` ile verdigi islemler de 11 rolde matrisle birebir ayni.

Matrise uygun ama dikkat ceken yerler:
- **F1:** Satin Alma sayfasi (`sayfa.satin-alma`) hicbir rolde yok; satin_alma rolu satin alma ekranini goremiyor. Durus nedenleri ve Ayarlar da yalniz yoneticide.
- **F2:** Ikinci menude sayfa islemi `sayfa.arkon` olan bolumler, Arkon'a giren herkese gorunuyor: operator ve bakim Pano, Planlama, Hazirlik, Kalite, Raporlar ve Ayarlar'i goruyor. "Cizim" yalniz `arkon.hazirlik` ile, "TMI'ye yazilamayanlar" yalniz `arkon.yansima-oku` ile gorunuyor.
- **F3:** Malzemelerde "Malzeme ayarlari" `sayfa.malzemeler` ile gorunuyor (operator dahil). "Yeni malzeme" yalniz yazma yetkisi olana.

## Calistirilmayan ya da eksik kalanlar

- #290 (denetimEki) birlesmemisti; denemede yok.
- b adimi son turda tekrarlanmadi (VARSAYIM: #286, #287 ve #289 Arkon derlemesine dokunmuyor).
- Yalniz Chromium, 1280x800; tablet, dokunmatik ve Safari calistirilmadi. Gercek tam ekran (Fullscreen API) basliksiz tarayicida denenmedi.
- Cizim studyosunun ornek dosyalari derlemede yok (b4). STEP okuyucuyu kendi uydurma STEP dosyamla denedim.
- Mudurun "Yeniden dene" akisi `hatali` satir olusmadigi icin denenmedi.
- Bakim, satin alma, depo, IK, idari ve finans rolleri yalniz menu (f) icin denendi; kendi islerinde denenmedi.

## Dosyalar

- `tarayici-denemesi/ilk-tur-dd7fd6c/` ve `son-1a7892e/` : adim klasorleri (`a`, `b`, `c`, `d`, `e`, `f`), ekran goruntuleri ve ham JSON.
- `tarayici-denemesi/csp-satirlari.txt` : CSP satirlarinin aynen dokumu.
- `tarayici-denemesi/betikler/` : Playwright betikleri. Depoya girmez; parola betikte deneme degeridir.
- `tarayici-denemesi/deneme-dosyalari/` : uydurma PDF, STL, STEP.
