# Ekran olcumu: 360, 768, 1280 (N7, salt okuma)

Tarih 2026-10-08. Depo heylit/TMICOREV2, main `7c20cef`. Depoda dosya degismedi; package.json dokunulmadi, depoya paket eklenmedi.

## Sonuc

- Yatay sayfa tasmasi: 48 ekran x 3 genislikte **yok** (144 olcumun hepsinde 0 px). DOGRULANDI (`ekran-olcumu/olcum.json`, `sayfaTasmasi`).
- Gorunur alandan tasan oge (kaydirma kutusu disinda): **yok**. DOGRULANDI (`tasanSayisi` hepsi 0).
- Asil sorun **Arkon, 1280'de**: Arkon cercevesi 960 px'e dusuyor, Arkon masaustu duzenini `zoom 0.57` ile kucultuyor. Metin 6.3-9 px'e, dugmeler 19-23 px yukseklige iniyor. DOGRULANDI (asagida B1).
- Dokunma hedefi: 360 ve 768'de TMI kabugu ve TMI ekranlarinda 24 px alti hedef yok; satin alma ve malzemeler ekranlarinda 44 px alti hedef cok. Ayrinti bulgularda.
- 7 ekran yer tutucu ("yapim asamasinda"): cizelge, kuyruk, matris, mesai, rota, stok, vardiya. Olculdu ama icerik yok.

## Nasil olculdu

- Ortam: bulut kapsayicisi, Node 24.21, PostgreSQL 16 (yerel), `npm ci`, `npm run goc` (37 goc), `npm run derle:arkon`, `npm run sunucu` (4100) ve `npm run gelistir:istemci` (4101).
- Tarayici: kapsayicida kurulu Chromium ve Playwright (depo disinda, `/opt`). Betik: `ekran-olcumu/olc.cjs`.
- Pencere: 360x740, 768x1024, 1280x800. 360 ve 768'de dokunmatik acik. Giris `yonetici` rolu (butun islemler).
- Deneme verisi API ile girildi (uydurma adlar): 2 is merkezi, 3 istasyon, 2 makine, 3 kisi, 2 durus ve 1 hurda nedeni, 2 olcu aleti, 3 satin alma talebi taslagi. Malzeme karti, uretim emri, is emri yok; bu ekranlar bos ya da az veriyle olculdu.
- Arkon'da ilk acilista cikan "Hangi istasyonda?" penceresinde F01 secildi, sonra olculdu.
- Dis istek: uygulama sayfalarindan localhost disina **hic istek gitmedi** (betik hepsini yakalayip sayiyor: 0). Chromium'un kendi arka plan baglantilari (google.com, gvt1.com) ag vekili tarafindan reddedildi; uygulamadan degil.

Olculen degerler (her ekran ve cercevesi icin): sayfa tasmasi (px), gorunur alandan tasan oge sayisi, 24 px alti ve 44 px alti dokunma hedefi (kucuk kenar), 12 px alti metin (efektif, zoom dahil), kirpilan ve uc noktayla kesilen ogeler, yatay kaydirma kutulari, konsol hatasi.

## Tablo

Hucre bicimi: `tasma px / tasan oge / hedef<24 / hedef<44 / toplam hedef / metin<12px`. Arkon ve malzemeler ekranlari cerceve (iframe) icindedir; sayilar kabuk + cerceve toplamidir. `z0.57` = cerceve icinde zoom. `YT` = yer tutucu.

| Ekran | 360 | 768 | 1280 |
|---|---|---|---|
| (giris) | 0/0/0/0/3/0 | 0/0/0/0/3/0 | 0/0/0/0/3/0 |
| / | 0/0/0/0/9/0 | 0/0/0/0/21/0 | 0/0/0/0/21/0 |
| /arkon | 0/0/0/1/36/12 | 0/0/0/1/48/12 | 0/0/6/30/67/66 z0.57 |
| /arkon/pano | 0/0/0/4/24/11 | 0/0/0/4/36/11 | 0/0/3/5/35/57 z0.57 |
| /arkon/planlama | 0/0/1/8/27/0 | 0/0/1/8/39/0 | 0/0/7/8/38/23 z0.57 |
| /arkon/hazirlik | 0/0/1/2/24/1 | 0/0/1/2/36/1 | 0/0/2/6/36/13 z0.57 |
| /arkon/kalite | 0/0/0/8/29/0 | 0/0/0/7/41/0 | 0/0/6/7/37/16 z0.57 |
| /arkon/cizim | 0/0/1/3/36/15 | 0/0/1/3/48/15 | 0/0/31/48/78/105 z0.57 |
| /arkon/bakim | 0/0/0/8/27/3 | 0/0/0/8/39/3 | 0/0/7/8/38/15 z0.57 |
| /arkon/raporlar | 0/0/5/18/37/47 | 0/0/5/18/49/47 | 0/0/17/18/48/114 z0.57 |
| /arkon/tmi-yansimalari | 0/0/0/0/19/0 | 0/0/0/0/31/0 | 0/0/0/0/31/0 |
| /arkon/ayarlar | 0/0/0/6/29/5 | 0/0/0/6/41/5 | 0/0/5/10/40/36 z0.57 |
| /ayarlar | 0/0/0/0/11/0 | 0/0/0/0/23/0 | 0/0/0/0/23/0 |
| /cizelge | 0/0/0/0/8/0 YT | 0/0/0/0/20/0 YT | 0/0/0/0/20/0 YT |
| /durus-nedenleri | 0/0/0/0/25/0 | 0/0/0/0/37/0 | 0/0/0/0/37/0 |
| /durus-nedenleri/hurda | 0/0/0/0/19/0 | 0/0/0/0/31/0 | 0/0/0/0/31/0 |
| /istasyonlar | 0/0/0/0/16/0 | 0/0/0/0/28/0 | 0/0/0/0/28/0 |
| /istasyonlar/makineler | 0/0/0/0/15/0 | 0/0/0/0/27/0 | 0/0/0/0/27/0 |
| /istasyonlar/is-merkezleri | 0/0/0/0/15/0 | 0/0/0/0/27/0 | 0/0/0/0/27/0 |
| /istasyonlar/kisi-kisitlari | 0/0/0/0/13/0 | 0/0/0/0/25/0 | 0/0/0/0/25/0 |
| /kalibrasyon | 0/0/0/0/14/0 | 0/0/0/0/26/0 | 0/0/0/0/26/0 |
| /kalibrasyon/turler | 0/0/0/0/23/0 | 0/0/0/0/35/0 | 0/0/0/0/35/0 |
| /personel | 0/0/0/0/26/0 | 0/0/0/0/38/0 | 0/0/0/0/38/0 |
| /kuyruk | 0/0/0/0/8/0 YT | 0/0/0/0/20/0 YT | 0/0/0/0/20/0 YT |
| /malzemeler | 0/0/0/9/24/0 | 0/0/0/9/36/0 | 0/0/0/7/36/0 |
| /malzemeler/yeni | 0/0/1/14/43/0 | 0/0/1/14/55/0 | 0/0/1/12/55/0 |
| /malzemeler/sablonlar | 0/0/0/4/26/0 | 0/0/0/4/38/0 | 0/0/0/2/38/0 |
| /malzemeler/operasyonlar | 0/0/288/796/811/0 | 0/0/288/796/823/0 | 0/0/288/794/823/0 |
| /malzemeler/ayarlar | 0/0/0/22/42/0 | 0/0/0/22/54/0 | 0/0/0/20/54/0 |
| /malzemeler/kilavuz | 0/0/0/4/18/29 | 0/0/0/4/30/29 | 0/0/0/2/30/29 |
| /matris | 0/0/0/0/8/0 YT | 0/0/0/0/20/0 YT | 0/0/0/0/20/0 YT |
| /mesai | 0/0/0/0/8/0 YT | 0/0/0/0/20/0 YT | 0/0/0/0/20/0 YT |
| /rota | 0/0/0/0/8/0 YT | 0/0/0/0/20/0 YT | 0/0/0/0/20/0 YT |
| /satin-alma | 0/0/0/3/25/0 | 0/0/0/3/37/0 | 0/0/0/3/37/0 |
| /satin-alma/talepler | 0/0/0/14/33/0 | 0/0/0/14/45/0 | 0/0/6/20/51/0 |
| /satin-alma/malzemeler | 0/0/0/9/28/0 | 0/0/0/9/40/0 | 0/0/0/9/40/0 |
| /satin-alma/tedarikciler | 0/0/0/6/25/0 | 0/0/0/6/37/0 | 0/0/0/6/37/0 |
| /satin-alma/raporlar | 0/0/0/8/27/0 | 0/0/0/8/39/0 | 0/0/0/8/39/0 |
| /satin-alma/onay-bekleyenler | 0/0/0/3/22/0 | 0/0/0/3/34/0 | 0/0/0/3/34/0 |
| /satin-alma/tum-talepler | 0/0/0/14/33/0 | 0/0/0/14/45/0 | 0/0/6/20/51/0 |
| /satin-alma/onay-raporlari | 0/0/0/8/27/0 | 0/0/0/8/39/0 | 0/0/0/8/39/0 |
| /satin-alma/taleplerim | 0/0/0/4/26/0 | 0/0/0/4/38/0 | 0/0/0/4/38/0 |
| /satin-alma/teslim-bekleyenler | 0/0/0/0/19/0 | 0/0/0/0/31/0 | 0/0/0/0/31/0 |
| /satin-alma/ayarlar | 0/0/0/22/42/0 | 0/0/0/22/54/0 | 0/0/0/22/54/0 |
| /stok | 0/0/0/0/8/0 YT | 0/0/0/0/20/0 YT | 0/0/0/0/20/0 YT |
| /terminal | 0/0/0/0/11/0 | 0/0/0/0/23/0 | 0/0/0/0/23/0 |
| /uretim-emirleri | 0/0/0/0/10/0 | 0/0/0/0/22/0 | 0/0/0/0/22/0 |
| /vardiya | 0/0/0/0/8/0 YT | 0/0/0/0/20/0 YT | 0/0/0/0/20/0 YT |

## Bulgular (etkisi buyukten kucuge)

| No | Ekran | Genislik | Bulgu | Kanit | Durum |
|---|---|---|---|---|---|
| B1 | Arkon (butun alt sayfalar) | 1280 | Kabuk yan menuleri (72 + 248 px) cerceveyi 960 px'e dusuruyor. Arkon 900 px ustunde masaustu duzenine geciyor ve `zoom = min(W/(1600+ray), H/900)` ile 0.57'ye kuculuyor. Efektif metin 6.3-9.1 px ("MES" 6.3, istasyon alt satiri 7.4, sekme dugmeleri 7.4); dugmeler 19-23 px yuksek (`button.seg` 41x19, `button.chp` 35x21, `Okut` 45x18). Cizimde 48 hedefin 31'i 24 px alti. Kaydirma yok, her sey kucuk. | `arkon/web/src/app/baslat.ts:57-62` (`useFit`), `goruntuler/arkon-1280.png`, `arkon_planlama-1280.png`; `olcum.json` cerceve `zoom: 0.570071` | DOGRULANDI |
| B2 | /malzemeler/operasyonlar | hepsi | 96 operasyon satirinin her biri duzenlenebilir: 797 etkilesimli oge, 288'i 13x13 px onay kutusu ve 21x28 px "x" dugmesi. Tur secimi kutusu daralip "Kesin" gibi kesik gorunuyor (1280). "Yeni operasyon" formunda etiket ve kutu ayni satirda karisik akiyor (360 ve 1280). | `goruntuler/malzemeler_operasyonlar-360.png`, `-1280.png` | DOGRULANDI |
| B3 | /malzemeler (butun bolumler) | 1280 | Uc gezinme yan yana: TMI rayi, TMI ikinci menusu ve cercevenin kendi "Malzeme Katalogu" yan menusu (Araclar, QR okut, Ayarlar). Icerik alani daraliyor; operasyon tablosu yatay kaydirmaya dusuyor. 768'de cercevenin kendi menusu gizli, sorun yok. | `goruntuler/malzemeler_operasyonlar-1280.png`, `malzemeler-768.png` | DOGRULANDI |
| B4 | /malzemeler (butun bolumler) | 768, 1280 | Cerceve yuksekligi pencereyi doldurmuyor; altta bos serit kaliyor (1280'de cerceve ~690 px'te bitiyor). | `goruntuler/malzemeler_operasyonlar-1280.png`, `malzemeler-768.png` | DOGRULANDI (gorselden) |
| B5 | Satin alma (butun bolumler) | hepsi | Ust araclar 44 px altinda: arama 39 px, "USD 46" kur dugmesi 34 px, "Yeni talep" 34 px, Liste/Akis panosu 32 px, "Kataloga aktar" 27 px. Ayarlar ekraninda 54 hedefin 22'si 44 px alti. 1280'de liste basligindaki siralama dugmeleri 17-81 x 19 px. 24 px alti hedef 360 ve 768'de yok. | `olcum.json` `h44Ornek`, `h24Ornek`; `goruntuler/satin-alma-768.png` | DOGRULANDI |
| B6 | Arkon (mobil duzen) | 360, 768 | Raporlarda "CSV" dugmeleri 36x22 px (5 adet), cizimde "Yeni" 36x22; planlamada onay kutusu 19 px. Ust etiketler (`span.over`) 10-11 px, raporlarda 47 metin 12 px alti. | `olcum.json` cerceve `h24Ornek`, `kucukYaziOrnek` | DOGRULANDI |
| B7 | Kabuk sayfa basligi | 360 | Uzun basliklar uc noktayla kesiliyor: "Malzeme K...", "Durus ve Hurda Nedenleri", "Sistem Ayarlari", "Uretim Emirleri", "Gunluk Mesai", "Plan Cizelgesi". | `goruntuler/malzemeler_operasyonlar-360.png`; `olcum.json` `elipsOrnek` (`h1.tc-kabuk-baslik`) | DOGRULANDI |
| B8 | Ikinci menu (sekme cubugu) | 360, 768 | Ikinci menu yatay kayan sekme cubuguna donuyor; sagdaki sekmeler kesik gorunuyor ("Is merk...", "Malzeme aya..."). Kaydirilabilir; kaydirma isareti yok. | `goruntuler/istasyonlar-360.png`, `satin-alma-768.png` | DOGRULANDI (gorselden) |
| B9 | /malzemeler/kilavuz | hepsi | 29 ornek satiri 11.5 px (`small`). | `olcum.json` | DOGRULANDI |
| B10 | Tablolu TMI ekranlari (istasyonlar, kalibrasyon, personel, durus nedenleri) | 360 | Tablo kart duzenine donuyor, `thead` gorsel olarak gizli; olcum bunu "kirpilan oge" saydi. Bulgu degil; ekran okuyucu icin gizleme kalibi. | `goruntuler/istasyonlar-360.png` | VARSAYIM (kalip bilerek kurulmus; kodda bakilmadi) |

Konsol hatasi: 144 olcumun hicbirinde yok. Sayfa bulunamadi: yok.

## Olculemeyenler

- Yalniz Chromium (masaustu motoru). Safari ve gercek dokunmatik cihaz **calistirilmadi**.
- Yalniz yonetici rolu. Operator, planlama gibi dar rollerde menu ve ekran **calistirilmadi**.
- Pencereler, formlar, ayrinti ekranlari (`/uretim-emirleri/:id`, talep ayrintisi, yeni kayit pencereleri) acilmadi; yalniz ilk acilan gorunum olculdu.
- Dolu veri yok: uretim emri, is emri, malzeme karti girilmedi. Uzun listelerde ve uzun adlarda tasma bu olcumde gorulmez.
- Yukseklik sabit (740, 1024, 800). Yatay telefon (740x360) ve 1280'den genis ekran **calistirilmadi**.
- 44 px esigi dokunmatik icindir; 1280 sutunundaki 44 px alti sayilar fare kullaniminda sorun sayilmayabilir.

## Dosyalar

- `ekran-olcumu/goruntuler/` : 144 ekran goruntusu (`<ekran>-<genislik>.png`, giris dahil).
- `ekran-olcumu/olcum.json` : ham olcum (ornek seciciler dahil).
- `ekran-olcumu/olc.cjs` : olcum betigi; depoya girmez. Calistirmak icin: istemci 4101'de acik, `yonetici / <parola>` hesabi, `node olc.cjs <cikti klasoru>` (parola betikte deneme degeridir, degistirin).
