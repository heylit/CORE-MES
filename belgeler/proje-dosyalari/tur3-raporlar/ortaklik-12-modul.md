# Ortaklik tablosu, 12 modul (tur 3, N6, salt okuma)

Tarih: 2026-10-08. Depoda dosya degistirilmedi, commit yok. `kurulum/eski-kurallar` okunmadi.

## Kaynak (DOGRULANDI, `git ls-tree` ve `git show`)
- main `7c20cef`. Butun ORTAKLIK dosyalari main'den okundu. Acik dallardaki surumler ya main ile ayni ya da daha eski (satin-alma: main'deki surum en yeni).
- 12 modul: arkon, ayarlar, denetim, durus-nedenleri, istasyonlar, istek-kimligi, kalibrasyon, kisiler, malzemeler, oturum, satin-alma, uretim-emirleri. VARSAYIM: 13. klasor `saglik` sayilmadi, cunku tablo tutmuyor (goclerde `saglik` tablosu yok). Bu varsayim yanlissa geri almasi ucuz.
- ORTAKLIK dosyasi olmayanlar: **uretim-emirleri** ve **istek-kimligi**. Bunlar goclerden okundu (`20261007002531_uretim_emirleri_tablolar.sql`, `..._sayim_olay.sql`, `..._adimlar.sql`, `20261007154424_istek_kimligi.sql`). Iki dosya Asama 2'den once yazilmali.
- Sayilmayan dallar: `34-vardiya` ve `105-istasyon-kisi-ekip-kapasite`. Bunlarin main ile ortak gecmisi yok (`git diff` "no merge base"), bu yuzden okunmadi.
- Malzemelerin eski tablolari (`malzeme`, `kalite`, `form`, `secenek` ve digerleri) goclerde DROP edilmis, tabloya girmedi.

## Tablo
Sahibi: **Sabit** = proje talimatindaki sabit kimlik ya da onayli karar. **Beyan** = yalniz modulun kendi ORTAKLIK dosyasinda yazili; kullanici onayi gorulmedi. **Yok** = sahibi belirsiz. Son sutun asagidaki soru kodudur.

| # | Kavram | Tutan modul (tablo.sutun) | Sahibi | Cakisma | Soru |
|---|---|---|---|---|---|
| 1 | Kisi | kisiler `kisi.id/.ad/.aktif/.sicil_no`; 10 modulde `*kisi_id` yabanci anahtar; ad kopyasi: arkon govde `by/decidedBy...`, malzemeler `kayit.onay.*.byAd`, `kayit.g.sorumlu`, satin-alma `_tedarikci_degerlendirmesi.degerlendiren` | Sabit: kisiler | Kucuk: metin ad kopyalari | - |
| 2 | Kullanici (giris) | kisiler `kisi.kullanici_adi/.parola_ozeti`; oturum `giris_denemesi.kullanici_adi` (bilerek yabanci anahtarsiz) | Beyan: kisiler | Yok | - |
| 3 | Rol, rol x islem | kisiler `rol`, `kisi_rolu`, `rol_islemi` (K2 a); arkon `kv/perms` (turetilir, yazimi reddedilir) | Beyan: kisiler (K2 a) | Kucuk: arkon salt okuma kopyasi | - |
| 4 | Gorev | kisiler `kisi.gorev` (serbest metin) | Beyan: kisiler | Vardiya ve personel gelince olabilir | S2 |
| 5 | Oturum | oturum `oturum`, `giris_denemesi` | Beyan: oturum | Yok | - |
| 6 | Denetim (komut defteri) | denetim `denetim_kaydi`; ayni ise yakin izler: arkon `arkon_kayit` tur `audit`, satin-alma `satin_alma_hareket` | Beyan: denetim | VAR: uc iz ortusuyor | S3 |
| 7 | Istek kimligi (tekrar korumasi) | istek-kimligi `istek_kimligi` | Beyan: istek-kimligi (ORTAKLIK yok) | Yok | - |
| 8 | Sistem ayari | ayarlar `ayar` (`malzemeler.dort-goz`, `satin-alma.dort-goz`); modul ici ayar: `malzeme_katalog_ayari`, `satin_alma_ayar`, arkon `kv/policy`, `kv/mode` | Beyan: ayarlar | VAR: iki ayar deposu yan yana | O10 |
| 9 | Malzeme, parca | malzemeler `malzeme_katalog_karti.no`; satin-alma `satin_alma_katalog` (+ `malzeme_id` bos duz sayi); arkon pkgs `govde.partNo/.part/.material` (metin); uretim-emirleri `uretim_emri.parca_no/.parca_ad` (metin) | Sabit: malzemeler | VAR: ikinci katalog ve iki metin kopya | O6 |
| 10 | Firma (tedarikci, musteri) | finans `finans_firma.id` (depoda yok); satin-alma 5 tabloda `firma_id` (duz sayi), `satin_alma_teklif.tedarikci_adi`; malzemeler `kayit.com.ted`, `kayit.g.musteri` (metin) | Sabit: finans | VAR: metin kopyalar; finans gelmeden baglanmaz | - |
| 11 | Tedarikci durumu, puani, kategorisi | satin-alma `satin_alma_tedarikci.durum/.puan`, `_tedarikci_kategorisi`, `_tedarikci_degerlendirmesi` | Beyan: satin-alma | Yok | - |
| 12 | Is merkezi, istasyon, makine | istasyonlar `is_merkezi`, `istasyon`, `makine`; arkon `kv/plant`, `arkon_kayit.makine/.is_merkezi` (metin); malzemeler `kayit.ops[].merkez` (metin); uretim-emirleri `uretim_emri.istasyon_id` ve 3 kayit tablosunda yabanci anahtar | Sabit: istasyonlar | VAR: arkon ve malzemelerde kod metni | - |
| 13 | Kisinin is merkezi kisiti | istasyonlar `kisi_is_merkezi`; cekirdek `kapsam.ts` okur | Beyan: istasyonlar | Yok | - |
| 14 | Operasyon tipi | istasyonlar `istasyonlar_operasyon_tipi`; malzemeler ekran sabiti `OPS` ve ayar `operasyonlar`; arkon pkgs `operasyon` (metin) | Beyan: istasyonlar ("kullanici karari") | VAR: malzemelerin kendi listesi | O1 |
| 15 | Rota, recete | malzemeler `kayit.ops[]`, `kayit.bom[]`; uretim-emirleri `emir_adimi.sira/.ad` (emre kopya) | Yok: rota modulu depoda yok | VAR | O1 |
| 16 | Uretim emri, is emri | uretim-emirleri `uretim_emri`, `emir_adimi`; arkon pkgs (no, hedef, termin, durum, oncelik), `arkon_tmi_yansima.emir_id` (bilerek yabanci anahtarsiz). UE5 karari: Arkon paketi is emrine baglanir; bugun bag `tmi-ue-<emir id>` ile uretim emrine (`arkon/UYUM-BORCU.md`) | Sabit: uretim-emirleri | VAR: arkon paralel is paketi | O8 |
| 17 | Uretim olayi, sayim | uretim-emirleri `uretim_olayi`, `uretim_sayimi`, `uretim_kaydi`, `emir_adimi_olayi`; arkon `arkon_kayit` tur `events/counts`, results `govde.good/.scrap` | Sabit: uretim-emirleri | VAR: Arkon kaydi esas, emre yansima | O8 |
| 18 | Durum listeleri | her modul kendi kisitli listesi; arkon govdede sabit metin, kisitsiz | Her modul kendi | VAR: arkon paket durumu ile `uretim_emri.durum` | O8 |
| 19 | Durus nedeni, hurda nedeni | durus-nedenleri `durus_nedeni`, `hurda_nedeni` (`uretim_olayi`, `uretim_sayimi` yabanci anahtarla bagli); arkon `kv/reasons`, `kv/scraps` (salt okuma) | Beyan: durus-nedenleri | Kucuk: arkon kopyasi | S1 |
| 20 | Cagri ekibi | durus-nedenleri `durus_nedeni.cagri_ekibi` (bakim, kalite, malzeme, amir); arkon `arkon_kayit` tur `calls` | Yok | Kismi | S4 |
| 21 | Olcu aleti, kalibrasyon | kalibrasyon `olcu_aleti`, `olcu_aleti_turu`, `kalibrasyon_kaydi`; arkon depo `gauges`; malzemeler demirbas `kayit.g.kalAy/.sonKal` | Beyan: kalibrasyon | VAR: arkonda ikinci alet kaydi | O2 |
| 22 | Vardiya, vardiya devri | arkon `kv/shifts`, `kv/handover` | Yok: personel-vardiya modulu depoda yok | Vardiya modulu gelince | O3 |
| 23 | Bakim | arkon depo `maint`; malzemeler demirbas `kayit.g.bakimAy` | Yok | Kucuk | O9 |
| 24 | Kontrol plani, olcum, numune | arkon pkgs `plan[]`, `arkon_kayit` tur `meas`, depo `requests`; malzemeler `kayit.g.kontrol` (metin) | Yok | Kucuk | O9 |
| 25 | Planli durus | arkon depo `downs` | Yok | Bugun yok | O9 |
| 26 | Malzeme lojistigi (istek, cikis) | arkon depo `logi` | Yok: stok depoda yok | Stok gelince | O7 |
| 27 | Depo, raf, konum | malzemeler `kayit.g.depoYeri/.konum`; kalibrasyon `olcu_aleti.yer`; istasyonlar `istasyon.tip = 'depo'` (metin) | Yok: stok depoda yok | VAR: uc yerde | O7 |
| 28 | Olcu birimi | malzemeler `kayit.com.birim`, ekran sabiti `BIRIMLER`; satin-alma `satin_alma_katalog.birim`, `satin_alma_talep_kalemi.birim` (metin) | Yok | VAR | O4 |
| 29 | Para birimi, kur | satin-alma `satin_alma_kur` (4 kod), `satin_alma_teklif.para_birimi/.kur`, `satin_alma_sabit_kur`; malzemeler `kayit.com.pb` (metin) | Yok | VAR | O5 |
| 30 | Fiyat | malzemeler `kayit.com.fiyat/.moq`; satin-alma `satin_alma_teklif_satiri.birim_fiyat` | Yok | Kismi: katalog fiyati ile teklif fiyati farkli anlam | O5 |
| 31 | Departman, butce | satin-alma `satin_alma_birim.ad/.yillik_butce` | Beyan: satin-alma | Yok; adi olcu birimiyle karisiyor | S5 |
| 32 | Belge no | malzemeler stok kodu (`malzeme_katalog_kod_sirasi`); satin-alma talep `ST-yil-sira`, katalog `M-0001`, `siparis_no` (metin); uretim-emirleri `uretim_emri.emir_no` (`UE-`); kalibrasyon `olcu_aleti.no`, `sertifika_no`; arkon pkgs `govde.no` (sunucuda sayac yok) | Her modul kendi | VAR: iki malzeme kodu; arkon paket no ile `UE-` | O6, O8 |
| 33 | Kategori, siniflama | malzemeler ekran sabitleri `FAMS`, `SARF_KAT`, `SERTIFIKA`; satin-alma `satin_alma_kategori` | Yok | Kismi | O6 |
| 34 | Dosya, cizim | arkon `arkon_dosya`, depo `draws`; malzemeler `kayit.g.resim/.rev` (metin) | Yok: ortak dosya deposu yok (kart #82) | Kismi | S6 |

## Asama 2 sahiplik sorulari (en cok 10; cevap kodla, ornek "O1 a")
Not: koordinator kendi basina modul onermez; bu yuzden "modul yok" satirlarinda secenekler "bugun kalsin" ya da "sen modul verirsin" diye yazildi.

- **O1 Rota ve operasyon tipi.** Neden: rota bugun malzeme kartinin icinde (`kayit.ops[]`), operasyon listesi iki yerde. a) Rota ayri modulde olsun (kapsamda var, prototipini sen verirsin); recete malzemelerde kalsin; operasyon tipi istasyonlarda. b) Rota da recete de malzeme kartinda kalsin; operasyon tipi istasyonlarda, malzemeler oradan okusun. **Oneri: a.** Talimatta "rota tanimdir" yaziyor; a secilirse rota gelene kadar b gecerli olur.
- **O2 Olcu aleti ve kalibrasyon.** Neden: kalibrasyon modulu ile Arkon `gauges` ayni aleti tutuyor. a) Sahibi kalibrasyon olsun; Arkon ve malzeme demirbasi oradan okusun. b) Sahibi Arkon olsun. **Oneri: a.** Yalniz ekleme kaydi ve kisi yabanci anahtari kalibrasyonda var.
- **O3 Vardiya.** Neden: vardiya bugun yalniz Arkon `kv/shifts` icinde, akis B ise vardiya takvimini kullaniyor. a) Personel-vardiya modulu sahibi olsun, gelene kadar Arkon'da kalsin. b) Sahibi kalici olarak Arkon olsun. **Oneri: a.**
- **O4 Olcu birimi listesi.** Neden: malzemelerde ve satin almada iki ayri serbest liste var. a) Sahibi malzemeler olsun; satin alma oradan okusun. b) Ortak tanim olarak paylasilan tek liste olsun (cekirdek istegi). c) Serbest metin kalsin. **Oneri: a.**
- **O5 Para birimi, kur ve fiyat.** Neden: kur listesi satin almada, malzeme kartinda ise metin olarak para birimi var. a) Sahibi finans olsun, finans gelene kadar satin almada kalsin. b) Satin almada kalsin. c) Ayarlarda olsun. **Oneri: a.** Fatura ve odeme finansta.
- **O6 Satin alma katalogu ile malzeme karti.** Neden: iki katalog ve iki kod var (stok kodu ve `M-`). Karar 4 "senkron sonra" diyor. a) Asama 2'de `satin_alma_katalog.malzeme_id` malzeme kartina baglansin; ad, birim ve kategori malzemeden okunsun. b) Karar 4 aynen kalsin, iki katalog yan yana dursun. **Oneri: a.** Sabit kimlikte malzemenin sahibi malzemeler.
- **O7 Depo, konum ve malzeme lojistigi.** Neden: depo bilgisi uc yerde metin olarak duruyor, lojistik ise Arkon'da. a) Sahibi stok olsun (kapsamda var); gelene kadar metin olarak kalsin. b) Depo yeri istasyonlar `tip = 'depo'` kaydi olsun. **Oneri: a.**
- **O8 Arkon kaydi ile uretim kaydi.** Neden: Arkon kendi sayim ve olayini tutuyor ve emre yansitiyor (`arkon_tmi_yansima`). UE5 bagi is emrine tasiyor. a) Bugunku duzen kalsin: Arkon kaydi operator gunlugu olur, asil kayit emirde, bag is emrine (`emir_adimi`) tasinir. b) Arkon kendi sayimini birakip yalniz uretim-emirleri komutlarini cagirsin. **Oneri: a.** b, Arkon'un yansima kuyrugunu ve cevrimdisi davranisini yeniden yazdirir.
- **O9 Bakim, kontrol plani, olcum, numune, planli durus.** Neden: hepsi yalniz Arkon'da ve baska modulde karsiligi yok. a) Sen modul verene kadar Arkon'da kalsin. b) Simdiden Arkon sahibi sayilsin. **Oneri: a.**
- **O10 Ayar deposu.** Neden: `ayar` tablosunun yaninda modul ici ayar tablolari var. a) Sistem capi ve dort goz ayarlari ayarlar'da, modulun calisma ayarlari modulde kalsin (bugunku duzen). b) Hepsi ayarlar'a tasinsin. **Oneri: a.**

## Ikinci liste (sonra sorulur; kod verildi)
- S1: Durus ve hurda nedenleri. Sahibi durus-nedenleri olsun mu? (beyan; Arkon salt okuma) Oneri: evet.
- S2: `kisi.gorev` vardiya ve personel gelince oradan okunsun mu? Oneri: evet, o modul gelince.
- S3: Arkon `audit` ve `satin_alma_hareket` cekirdegin `denetimEki` kalibina (N4) tasinsin mi? Oneri: N4'ten sonra karar ver.
- S4: Cagri ekibi listesi rol ile mi baglansin, yoksa durus-nedenlerinde mi kalsin? Oneri: durus-nedenlerinde kalsin.
- S5: Departman listesi satin almada mi kalsin, yoksa finansa mi gitsin? Oneri: finans gelene kadar satin almada kalsin.
- S6: Dosya ve cizim icin ortak dosya deposu (kart #82) Arkon `arkon_dosya`'dan mi baslasin? Oneri: kart #82'de karar verilsin.

## Gozlem (tek satir oneri)
Bazi tablolar modul adiyla baslamiyor: istasyonlar `is_merkezi`, `istasyon`, `makine`; uretim-emirleri `emir_adimi`; kalibrasyon `olcu_aleti`; kisiler `kisi`, `rol`. Bunlar dolu tablo oldugu icin karar senin.
