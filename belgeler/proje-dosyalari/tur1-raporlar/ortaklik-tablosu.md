# Ortaklik tablosu (tur 1, salt okuma)

Tarih: 2026-10-08. Dosya degistirilmedi, commit yok.

## Okunan kaynaklar (DOGRULANDI, `git ls-tree` ve `git show`)
- main `27cf5bd`; 259-cekirdek-istekleri `4b5c3dc`; 172-ortak-arayuz-eksikleri-xo2mfl `8b1e5d0`; 163-malzemeler-oturtma-o7b51n `ad58498`; 186-istasyonlar-oturtma `bc2394a`; 199-arkon-oturtma `1cf2037`; 162-satin-alma-uyum `37aadba`.
- ORTAKLIK dosyasi olan dort modul: `ORTAKLIK-arkon.md` (butun dallarda ayni icerik), `ORTAKLIK-malzemeler.md` (butun dallarda ayni), `ORTAKLIK-satin-alma.md` (162 dalindaki yeni surum okundu; main'deki eski), `ORTAKLIK-istasyonlar.md` (yalniz 186 dalinda).
- Cekirdek ve ortak arayuzun ORTAKLIK dosyasi yok. Cekirdegin tuttugu kavramlar goclerden okundu: `kisi`, `rol`, `rol_islemi`, `denetim_kaydi` (`sunucu/gocler/20261005120000_kisiler.sql`, `..._denetim.sql`). 259 dali yeni tablo eklemiyor, yalniz islem ve rol satirlari (`20261008012100_kisiler_bakim_rolu_arkon_islemleri.sql`). Ortak arayuz tablo tutmuyor.
- Alti modul disindaki sahipler karsilastirma icin goclerden okundu: uretim-emirleri (`uretim_emri`, `emir_adimi`, `uretim_sayimi`, `uretim_olayi`, `uretim_kaydi`), durus-nedenleri (`durus_nedeni`, `hurda_nedeni`), kalibrasyon (`olcu_aleti`, `kalibrasyon_kaydi`), ayarlar (`ayar`).

## Tablo

"Sahibi belli" = proje talimatinin sabit kimliklerinde ya da onayli kararda yazili. "Beyan" = yalniz modulun kendi ORTAKLIK dosyasinda yazili (VARSAYIM, kullanici onayi gorulmedi).

| # | Kavram | Kim tutuyor (tablo.sutun) | Sahibi belli mi | Cakisan var mi |
|---|---|---|---|---|
| 1 | Malzeme, parca | malzemeler `malzeme_katalog_karti.no` (+ `stok_kodu`, `kayit.com.ad`); satin-alma `satin_alma_katalog.kod/.ad/.birim`, `.malzeme_id` (bos duz sayi); arkon `arkon_belge` pkgs `govde.partNo/.part/.material` (metin); uretim-emirleri `uretim_emri.parca_no/.parca_ad` (metin) | Evet: malzemeler (sabit kimlik) | VAR: satin almanin ikinci katalogu (kullanici karari 4, senkron sonra); arkon ve uretim emri metin kopya |
| 2 | Firma (tedarikci, musteri) | finans `finans_firma.id` (depoda yok); satin-alma `satin_alma_tedarikci.firma_id` ve 4 tabloda `firma_id` (duz sayi), `satin_alma_teklif.tedarikci_adi` (ad kopyasi); malzemeler `kayit.com.ted`, `kayit.g.musteri` (metin) | Evet: finans (sabit kimlik) | VAR: malzemelerde metin; satin almada gecici karsilik `firma-gecici.ts`; finans gelmeden baglanamaz |
| 3 | Tedarikci durumu, puani, kategorisi, degerlendirmesi | satin-alma `satin_alma_tedarikci.durum/.puan`, `_tedarikci_kategorisi`, `_tedarikci_degerlendirmesi` | Beyan: satin alma | Yok |
| 4 | Kisi | cekirdek `kisi.id`; her modulde `*_kisi_id` yabanci anahtar; ad kopyalari: arkon belge govdesi `by/decidedBy/closedBy...`, malzemeler `kayit.onay.*.byAd`, `kayit.g.sorumlu`, satin-alma `_tedarikci_degerlendirmesi.degerlendiren` | Evet: kisiler (sabit kimlik) | Kucuk: metin ad kopyalari |
| 5 | Rol, yetki matrisi | cekirdek `rol`, `rol_islemi`, `kisi.rol_id`; arkon `kv/perms` (TMI'den turetilir, yazimi reddedilir) | Evet: cekirdek | Kucuk: arkon salt okuma kopyasi |
| 6 | Is merkezi, istasyon, makine | istasyonlar `is_merkezi`, `istasyon`, `makine`; arkon `kv/plant`, `arkon_kayit.makine/.is_merkezi` (metin); malzemeler `kayit.ops[].merkez` (metin); uretim-emirleri `uretim_emri.istasyon_id` (yabanci anahtar) | Evet: istasyonlar (sabit kimlik) | VAR: arkon ve malzemelerde kod metni, kimlige bagli degil |
| 7 | Kisinin is merkezi kisiti | istasyonlar `kisi_is_merkezi`; arkon kullanici is merkezleri (TMI'den okur) | Beyan: istasyonlar | Yok |
| 8 | Operasyon tipi | istasyonlar `istasyonlar_operasyon_tipi`; malzemeler ekran sabiti `OPS` ve `malzeme_katalog_ayari` anahtar `operasyonlar`; arkon pkgs `operasyon` (metin) | Beyan: istasyonlar ("kullanici karari: katalog burada", ORTAKLIK-istasyonlar) | VAR: malzemelerin kendi listesi |
| 9 | Rota ve recete | malzemeler `kayit.ops[]`, `kayit.bom[]`; uretim-emirleri `emir_adimi.sira/.ad`; arkon pkgs operasyon, istasyon | Hayir: rota modulu depoda yok; talimatta "rota tanimdir, emre uretim-emirleri kopyalar" | VAR: rota bugun malzeme kartinda |
| 10 | Uretim emri, is emri | uretim-emirleri `uretim_emri`, `emir_adimi`; arkon pkgs (no, hedef, termin, durum, oncelik), `arkon_tmi_yansima.emir_id` (yabanci anahtarsiz) | Evet: uretim-emirleri (sabit kimlik) | VAR: arkon paralel is paketi tutuyor |
| 11 | Uretim olayi ve sayim | uretim-emirleri `uretim_sayimi`, `uretim_olayi`, `uretim_kaydi`; arkon `arkon_kayit` tur events/counts, results `govde.good/.scrap` | Evet: uretim-emirleri ("uretim kaydi uretim-emirleri") | VAR: arkon kendi kaydi, `arkon_tmi_yansima` ile emre yansitiyor |
| 12 | Durus nedeni, hurda nedeni | durus-nedenleri `durus_nedeni`, `hurda_nedeni`; arkon `kv/reasons`, `kv/scraps` (okur, yazimi reddedilir) | Beyan: durus-nedenleri (sabit listede yok) | Kucuk: arkon salt okuma kopyasi |
| 13 | Olcu aleti, kalibrasyon | kalibrasyon `olcu_aleti`, `kalibrasyon_kaydi`; arkon depo `gauges`; malzemeler demirbas `kayit.g.kalAy/.sonKal` | Hayir (sabit listede yok) | VAR: arkonda ikinci alet kaydi |
| 14 | Bakim | arkon depo `maint`; malzemeler demirbas `kayit.g.bakimAy` | Hayir: modul yok | VAR (kucuk) |
| 15 | Vardiya, vardiya devri | arkon `kv/shifts`, `kv/handover` | Hayir: personel-vardiya modulu depoda yok | Bugun yok; vardiya modulu gelince VAR |
| 16 | Planli durus | arkon depo `downs` | Hayir (plan ya da arkon) | Bugun yok |
| 17 | Kontrol plani, olcum, numune | arkon pkgs `plan[]`, `arkon_kayit` tur meas, depo `requests`; malzemeler `kayit.g.kontrol` (metin) | Hayir: kalite modulu yok | Kucuk |
| 18 | Malzeme lojistigi (istek, cikis) | arkon depo `logi` (kalem ve miktar metin) | Hayir: stok modulu yok | Stok gelince VAR |
| 19 | Depo, raf, konum | malzemeler `kayit.g.depoYeri`, `.konum` (metin); istasyonlar `istasyon.tip = 'depo'`; satin alma tutmuyor | Hayir: stok modulu yok | VAR: iki yerde depo kavrami |
| 20 | Olcu birimi | malzemeler `kayit.com.birim`, ekran sabiti `BIRIMLER`; satin-alma `satin_alma_katalog.birim`, `satin_alma_talep_kalemi.birim` (metin) | Hayir | VAR: iki serbest liste |
| 21 | Para birimi, kur | satin-alma `satin_alma_kur` (4 kod), `satin_alma_teklif.para_birimi/.kur`, `satin_alma_sabit_kur`; malzemeler `kayit.com.pb` (metin) | Hayir (finans ya da ayarlar) | VAR |
| 22 | Fiyat | malzemeler `kayit.com.fiyat/.moq`; satin-alma `satin_alma_teklif_satiri.birim_fiyat`, teklif iskonto ve masraflari | Hayir | Kismi: katalog fiyati ile teklif fiyati ayri anlam |
| 23 | Departman ve butce | satin-alma `satin_alma_birim.ad/.yillik_butce`, `satin_alma_talep.birim` | Beyan: satin alma (finans ya da kisiler olabilir) | Yok; ad "birim" olcu birimiyle karisiyor |
| 24 | Belge no | malzemeler stok kodu `malzeme_katalog_kod_sirasi`; satin-alma talep no `ST-yil-sira`, katalog kodu `M-0001`, `satin_alma_siparis.siparis_no` (metin); uretim-emirleri `uretim_emri.emir_no` (`UE-`); arkon pkgs `govde.no/.seq` (sunucuda sayac yok) | Her modul kendi numarasi | VAR: iki malzeme kodu (stok kodu ve `M-`); arkon paket no ile `UE-` no |
| 25 | Durum listeleri | her modul kendi kisitli listesi; arkon govdede sabit metin, kisitsiz | Her modul kendi | VAR: arkon emir durumlari ile `uretim_emri.durum` (planli, basladi, bitti, iptal) |
| 26 | Kategori, siniflama, sertifika | malzemeler ekran sabitleri `FAMS`, `SARF_KAT`, `SERTIFIKA`; satin-alma `satin_alma_kategori` | Hayir | Kismi: iki kategori listesi |
| 27 | Dosya, cizim | arkon `arkon_dosya`, depo `draws`; malzemeler `kayit.g.resim/.rev` (metin); satin alma tutmuyor | Hayir: ortak dosya deposu yok (kart #82) | Kismi |
| 28 | Denetim, hareket gecmisi | cekirdek `denetim_kaydi`; arkon `arkon_kayit` tur audit; satin-alma `satin_alma_hareket` | Cekirdek denetimde belli; modul izleri kendi | VAR: uc iz ortusuyor |
| 29 | Ayarlar, dort goz | ayarlar `ayar` (`malzemeler.dort-goz`, `satin-alma.dort-goz`); `satin_alma_ayar`; `malzeme_katalog_ayari`; arkon `kv/policy/.mode` | Her modul kendi; sistem ayari ayarlar | Yok |

## Kullaniciya sorulacak sahiplikler (Asama 2, "Hayir" ve "Beyan" satirlarindan)
Rota (9), olcu aleti ve kalibrasyon (13), vardiya (15), olcu birimi (20), para birimi ve kur (21), depo ve konum (19), malzeme lojistigi (18), bakim (14), kontrol plani ve olcum (17), durus nedenleri (12, beyan).

## Gozlem (tek satir oneri)
Bazi tablolar modul adiyla baslamiyor (proje talimati kural 5): istasyonlar `is_merkezi`, `istasyon`, `makine`; uretim-emirleri `emir_adimi`; kalibrasyon `olcu_aleti`. Dolu tabloyu degistiren is oldugu icin karar kullanicinin.
