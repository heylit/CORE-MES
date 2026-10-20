# TMI CORE V2 - Denetim durumu (BASLANGIC)

- Denetlenen commit: `21c2b9acf38459fb22a34a065fbe3c16698cc251` (main, "Merge pull request #320 from heylit/260-rota", 2026-10-08 17:35 +0300)
- Denetim tarihi: 2026-10-08
- Yontem: salt okuma; kod, dal, commit yok. Bes kolda modul taramasi + komut kosusu. `kurulum/eski-kurallar/` okunmadi.
- Ortam: Node 24.21.0, PostgreSQL 16.15 (CI postgres:18 kullanir; surum farki var). Ortam degiskenleri CI dosyasiyla ayni.
- Isaretler: [D] DOGRULANDI (dosya:satir ya da komut ciktisi) · [V] VARSAYIM · [?] BILMIYORUM.
- Asama 1 kurali: UYUM-BORCU.md'de "baglamada kapanacak" diye yazili olan bulgu sayilmadi. uretim-emirleri sahibi disarida; istek birikmesi durum sayildi, guvenlik acigi bulgu sayildi ve isaretlendi.

## Test, tip, lint (21c2b9a uzerinde, yerelde)

| Komut | Sonuc |
|---|---|
| `npm run tip` (4 tsc projesi) | GECTI, 0 hata [D] |
| `npm run sinir` | GECTI: "504 dosya, 0 ihlal" [D] |
| `npm run lint` (eslint + stylelint) | GECTI, 0 hata 0 uyari [D] |
| `npm run test:sunucu` (gercek PostgreSQL) | GECTI: 1377 test, 119 suite, 1377 gecti, 0 kaldi, 0 atlandi, 0 todo (205 sn) [D] |
| `npm run test:istemci` (vitest) | GECTI: 50 dosya, 622 test, 622 gecti [D] |
| `npm run derle:istemci` (arkon + istemci) | GECTI; yalniz "500 kB'den buyuk parca" uyarisi [D] |
| `npm run harita` | kosuldu; 52 goc, 19 sayfa islemi, sahibi belirsiz tablo 0 [D] |
| `araclar/vt/tasima-denemesi.sh` | CALISTIRILMADI |
| `arkon/web` icin test | YOK: `arkon/**/*.test.*` bos [D] |

Toplam: 1999 test, 0 kirmizi. Kirmizi yok; bulgularin hicbiri testle yakalanmiyor.

## Moduller

| Modul | Durum | Not |
|---|---|---|
| kisiler | tamam | KURAL-TEST adlari var; yetki matrisi belgesiyle goc satirlari birebir [D] |
| oturum | tamam | Acik uclar yalniz /oturum, giris, cikis [D] |
| denetim | tamam | Cekirdek istekleri kapali [D] |
| ayarlar | tamam | Denetim kaydini kendisi de yaziyor; borcta (madde 6) |
| dosya | tamam | GET 'oturum' ama servis yalniz yukleyene aciyor (DSK-07) |
| istek-kimligi | tamam | KURAL-TEST, UYUM-BORCU, ORTAKLIK yok (B-039) |
| saglik | tamam | Belge eksik (B-039) |
| malzemeler | tamam | Kod temiz; belgeler eskimis (B-035) |
| istasyonlar | tamam | 'oturum' uclari karar I1 ile ve veri kapsamli; belgeler eskimis (B-036) |
| kalibrasyon | yarim | KURAL-TEST, CEKIRDEK-ISTEKLERI, BASKA-MODUL-ISTEKLERI yok (B-026) |
| durus-nedenleri | yarim | Ayni uc belge yok; DN-10 bosluk (B-026, B-037) |
| rota | tamam | Asama 1 olcusunde; acik B1-B21 borcta; yalniz belge hatasi (B-034) |
| finans | sorunlu | Para hesabinda sapma, veri ezme, capraz kur sinirsiz (B-003, B-004, B-008, B-009) |
| satin-alma | sorunlu | Onay ve dort goz sunucuda delik (B-001, B-002) |
| arkon | sorunlu | Islemler 6 role verilmis (kullanici onayli, 2026-10-08); depo okuma ve kalite kapilari sunucuda yok (B-005, B-006, B-013) |
| uretim-emirleri | sorunlu (sahibi disarida) | Okuma uclari her girisliye acik (B-007); belge yok: durum |
| plan | durum | Sozlesme ve 4 islem var; sunucu ve istemci main'de yok (teslim ayri bekliyor) |
| vardiya | durum | Sunucu, istemci, sozlesme yok; islemleri yine de rollere verilmis (B-042) |
| terminal | durum | Yalniz istemci; terminal.uret uretim-emirleri uclarinda |
| sistem | durum | Yalniz istemci; sunucusu saglik |
| cekirdek (sunucu/cekirdek) | tamam | Rota yalniz uc.ts:377 app.route; yetki dogrulamadan once; denetim ayni tx'te [D] |
| paylasilan toplayicilar | tamam | Butun modul dosyalari kayitli [D] |
| istemci/src/ortak | tamam | Yetki suzmesi yalniz menu gorunurlugu; veri yetkisi sunucuda [D] |
| araclar/sinir-denetimi | yarim | Kurallar a-f, h calisiyor; boslukar B-038 |

## Bulgular

### KRITIK

- **B-001 KRITIK satin-alma: dort goz atlatilabilir.** Karar verenin kimligi ve karar tarihi istemciden gelir, oldugu gibi yazilir; dort goz denetimi bu istemci degerine bakar. Karar ve onay ayni istekte gelirse eski karar bos gorunur, denetim hic devreye girmez. [D] `sunucu/moduller/satin-alma/sorgular.ts:186-190` (`k.kararVerenKisiId, k.kararTarihi`), `servis.ts:198` (`eski.karar?.kararVerenKisiId ?? null`), istemci `istemci/src/moduller/satin-alma/merkez/tasiyici.ts:183`. Test bile karar vereni govdeden verir: `satin-alma.test.ts:318`. Borcta yok. Hafifletici: islemler bugun yalniz yoneticide (UYUM-BORCU 6) [V].
- **B-002 KRITIK satin-alma: onaysiz siparis.** `onayda -> siparis_verildi` ve `iptal -> siparis_verildi` gecisi onay kaydina bakilmadan serbest; `talepAc` durum gecisini hic denetlemez, talep dogrudan "siparis verildi" ile karar ve siparisle acilabilir; onay talep durumuna bakilmadan eklenir, onaydan sonra karar degisebilir. [D] `kurallar.ts:31-35` (GECISLER), `servis.ts:156-168` (talepAc), `servis.ts:182` (yalniz `gecisVarMi`), `servis.ts:196-200`.
- **B-003 KRITIK finans: duzenli odeme "odendi" KDV ayristirmasi 1 kurus sapar.** Net, JS float ile brutten geri hesaplanir; veritabani KDV'yi netten yeniden hesaplayinca toplam girilen tutardan 0,01 sapar ve hesaptan bu yanlis toplam duser. [D] `sunucu/moduller/finans/servis.ts:532` (`Math.round(Number(d.tutar) * 100 / (1 + ...`). Sapma orani: KDV %20'de 0,01-9.999,99 araliginda 166.667 tutar (ornek 0,15 -> 0,16) [D, benzetim]. Test yalniz KDV 0 ile kosar (`para.test.ts:428`); kural kurallar.ts'te degil.
- **B-004 KRITIK finans: odeme iptali aciklamayi siler.** Iptal nedeni odemenin `aciklama` alanina yazilir; asil aciklama kaybolur, var olan `iptal_nedeni` sutunu hic dolmaz. Karsiliksiz cek, cek iptali ve ciro geri alma da ayni yoldan gecer. [D] `sunucu/moduller/finans/sorgular.ts:252` (`aciklama = coalesce($3, aciklama)`), goc `20261008132300_finans_cekirdek.sql` `iptal_nedeni text`; `servis.ts:429,433,437`.

### YUKSEK

- **B-005 YUKSEK arkon: depo okumasinda rol denetimi yok.** GUVENLIK-DENETIMI "depo x rol okuma" der; kodda yalniz `rolGerekli` + konum kapsami var. Operator dahil her Arkon rolu maint, gauges, logi, requests, kv depolarinin hepsini okur; sinir yalniz tablette. [D] `sunucu/moduller/arkon/servis.ts:235-245, 260-267`; iddia `GUVENLIK-DENETIMI.md:14-15`. Borcta yok.
- **B-006 YUKSEK arkon: kalite kapilari yalniz tablette.** Ilk parca onayi olmadan seri uretim, kalite RED'de makine durdurma, kritik olcude ikinci kontrol sunucuda yok; operator `/arkon/kayitlar/events/ekle` ile `running` gonderir, bu emirBaslat'a yansir. [D] `arkon/web/src/app/kurallar.ts:92` (`firstPiece`), `operator.ts:83` (`nok:'stop'`), `kalite.ts:144` (`critTwice`); sunucuda grep bos. Borcta yok.
- **B-007 YUKSEK uretim-emirleri (sahibi disarida): uc okuma ucu her girisliye acik.** `GET /uretim-emirleri`, `/uretim-emirleri/:id`, `/terminal/isler` yalniz `'oturum'`; sayfasi olmayan roller butun emirleri ve kisi adlarini okur; `terminalIsleri` is merkezi kapsamiyla suzmez. ADR 0007 madde 4 ile celisir. [D] `sunucu/moduller/uretim-emirleri/uclar.ts:17,25,33`, `servis.ts:174`. Istek kok `BASKA-MODUL-ISTEKLERI.md:5-17`'de bekliyor.
- **B-008 YUKSEK finans: capraz kurun siniri yok.** Farkli para birimli dagitimda kur denetlenmez; 1000 EUR'luk belge cok kucuk kurla 0,01 TL odemeyle "kapandi" olabilir; `odeme_tutari = belge x kur` veritabaninda yeniden denetlenmez. [D] `sunucu/moduller/finans/kurallar.ts:102`; goc `finans_dagilim_denetle` yalniz ayni birimi denetler. Sinir icin onayli karar yok [V].
- **B-009 YUKSEK finans: dovizli mahsupta kur saklanmiyor ve denetlenmiyor.** ON-PAKET "iki tutar ve aradaki kur saklanir" der. [D] `kurallar.ts:118-119`, goc `CREATE TABLE finans_mahsup` kur sutunu yok; `ON-PAKET-finans-s4.md:40`.
- **B-010 YUKSEK satin-alma: senaryonun kisi ve zamani istemciden yazilir.** NOTLAR ve `kurallar.ts:53` "sunucunun" der. Ekran kisiyi bos gonderdigi icin her kayitta senaryo kisisi silinir. [D] `sorgular.ts:225-226` (`s.kisiId, s.olusturma`), `tasiyici.ts:193`.
- **B-011 YUKSEK satin-alma: kritik kurallar testsiz.** Onaysiz siparis, dogrudan "siparis verildi" ile acilis, karar verenin sunucuda yazilmasi icin reddeden test yok; SAT-56, 57, 60, 61, 62, 63, 68 hicbir test adinda yok. [D] (test dosyalarinda arandi).
- **B-012 YUKSEK finans: para komutlari testsiz.** `POST /finans/dagitimlar/:id/iptal` (belgeyi yeniden acar) hic testsiz, GUVENLIK:39 testi varmis gibi yazar; verilen cekin "odendi" basarili yolu ve bakiye etkisi testsiz. GUVENLIK:104 "her iptal ... 403" der; geri-al, cek iptali, dagitim iptali, hesap islemleri, KDV, duzenli odeme, butce icin 403 sinamasi yok. [D] `para.test.ts` (`dagitimlar/` gecmez; 403 satirlari 98-100, 285, 305, 331, 346, 404, 413, 444).

### ORTA

- **B-013 ORTA arkon: kullanima acma kapisi delinmis [KULLANICI ONAYLI DAGILIM 2026-10-08].** Arkon borcunda "kullanima acmadan once" maddeleri acikken (DS6 dosya okuma, sandbox, svg) `sayfa.arkon` ve `arkon.*` mudur, planlama_proje, cam, kalite, operator, bakim rollerine verilmis; CLAUDE.md Asama 1 "islemleri yalniz yoneticide kalir" ile celisir. [D] `sunucu/gocler/20261008012100_kisiler_bakim_rolu_arkon_islemleri.sql:28-41`; `sunucu/moduller/arkon/UYUM-BORCU.md:68` sonrasi. **KULLANICI ONAYLI DAGILIM (2026-10-08, AR1-b):** alti rolde kalir; bulgu kapanmis sayilmaz, risk kabul edildi. B-005 ve B-006 bu nedenle canli kalir; ilk kapatilacaklar onlar.
- **B-014 ORTA uretim-emirleri: kapi ayni sekilde.** Okuma acigi kapanmadan `uretim-emirleri.yaz` mudur ve planlamaya, `terminal.uret` mudur ve operatore verilmis. [D] `sunucu/gocler/20261007001021_kisiler_uretim_emri_islemleri.sql`. Kapi kurali bu gocten sonra yazilmis olabilir [V].
- **B-015 ORTA arkon: dosya yukleme her Arkon rolune acik** (tek dosya 200 MB). [D] `sunucu/moduller/arkon/servis.ts:654-691`; borc yalniz kotayi anlatir (UYUM-BORCU:84).
- **B-016 ORTA finans: surumsuz yazimlar.** Dagitim iptali surum almaz (govde `zod.object({})`, kopru `govde: () => ({})`); butce ayni donemi surumsuz ezer, degistiren kisi tutulmaz. [D] `uclar.ts` dagitimlar/:id/iptal, `istemci/src/moduller/finans/kopru.ts:43`, `sorgular.ts:330`.
- **B-017 ORTA finans: hesap tetikleyicisi hesap satirini kilitlemez** (firma tetikleyicisi `FOR SHARE` kullanir); eszamanli odeme ve "pasife al" yarisi pasif hesapta bakiye birakabilir. [D] kod; yaris [V], denenmedi.
- **B-018 ORTA finans: is kurallari servis.ts'te** (kategori, pesin/cek, KDV ayristirma, toplu aktarim); CLAUDE.md yapi kurali 2'ye aykiri. [D] `servis.ts:243, 267, 532, 566-574`.
- **B-019 ORTA finans: cekirdek hazir, modul eski.** Cekirdek `allow-forms` ve `useYalitilmisGorunum`'u verdi; finans hala `allow-forms`suz ve kendi kopru kopyasiyla. Sonuc: cerceve icindeki kayit formlari gonderilmiyor [V]. [D] `istemci/src/moduller/finans/FinansCercevesi.tsx:95` (`['allow-downloads', 'allow-modals']`), `istemci/src/ortak/arayuz/YalitilmisCerceve.tsx:5`, `istemci/src/ortak/rota/cerceve-gorunumu.ts:62`.
- **B-020 ORTA GUVENLIK-DENETIMI belgeleri koda uymuyor.** finans: "hedef koken `*` degil" der, kabuk `'*'` ile yollar (`istemci/src/ortak/arayuz/YalitilmisCerceve.tsx:62`); "para: listeler" adli test yok; UYUM-BORCU:27 "sandbox'siz srcDoc" der, kod yalitilmis cerceve. satin-alma: kaldirilmis uclari (`/satin-alma-teslimleri`, `teslim-al`) sayar, acilis ucunu 'oturum' yazar (kod `biri`, `uclar.ts:19`), "govdeyi tam yazar" der (kod `denetim: 'govdesiz'`, `uclar.ts:26,33`). [D]
- **B-021 ORTA satin-alma SAT-56 celiskisi.** ON-PAKET:62 "sunucu toplam, NBM ve oneriyi yeniden hesaplar" der; kodda yalniz teklif toplami (`sorgular.ts:175-181`), KURAL-TEST "ekranda" der. Karar yok. [D]
- **B-022 ORTA satin-alma KURAL-TEST hatali.** SAT-41/42 test adlari dosyada yok (bolunup yeniden adlandirilmis); goc adi `20261007150100` yazar, gercegi `20261007230000`; var olmayan `satin_alma_katalog_malzeme_no_fkey` kisitini anar. [D]
- **B-023 ORTA satin-alma ile stok arasinda tasarlanmis dongu.** Satin alma stoktan `teslimAlinanlar`, stok satin almadan `siparisSatirlari` ithal edecek; baglaninca ADR 0006 dongusu. Borc yalniz "disari ithaliyle degisir" der. [D] `sunucu/moduller/satin-alma/BASKA-MODUL-ISTEKLERI.md` "Stok", `disari.ts:2`, `teslim-bilgisi.ts:2`.
- **B-024 ORTA satin-alma: sayfa kapanirken bekleyen kayit kaybolabilir.** 8 sn "geri al" penceresindeki yazim kapanista keepalive'siz gider. [D] `merkez/store.ts:127-128`, `merkez/tasiyici.ts:347-348`. Borcta yok.
- **B-025 ORTA satin-alma: tedarikci silme surumsuz** (SAT-45 ile tutarsiz). [D] `uclar.ts:47-50`, `servis.ts:247`.
- **B-026 ORTA kalibrasyon ve durus-nedenleri: zorunlu belgeler yok.** KURAL-TEST.md, CEKIRDEK-ISTEKLERI.md, BASKA-MODUL-ISTEKLERI.md yok; kuralin teste baglandigi denetlenemiyor. [D] Glob bos; sart `kurulum/dis-modul-sartnamesi.md:62-64`.
- **B-027 ORTA cekirdek: uc kaydi ucun `uc()` ile kuruldugunu dogrulamaz.** Duz nesneyle verilen uc tanim anindaki denetimleri (kayitli islem, acik uc denetim kipi) atlar. [D] `sunucu/cekirdek/uygulama.ts` `modulBasinaUclar` (`modul.uclar as Uc[]`). Bugun ihlal yok [D, sinir 0].
- **B-028 ORTA arkon belgeleri rol dagilimi konusunda yanlis.** UYUM-BORCU:33, 43, 70, 117, UYGULA.md:212, `arkon.test.ts:83` "hicbir role verilmedi" der; CEKIRDEK-ISTEKLERI madde 1 ve 7 acik gorunur, goclerle (050300, 104500) kapanmis. [D]

### DUSUK

- **B-029 DUSUK arkon sozlesme:** "silmede surum gondermez" der, kod surumu zorunlu tutar. [D] `paylasilan/sozlesme/arkon.ts:50`, `sunucu/moduller/arkon/servis.ts:340`.
- **B-030 DUSUK arkon tanitim tohumunda parca no benzeri degerler** (`FLN-120`, `PMP-200`, `BRK-80`, `IE-2026-04817`). Uydurma oldugu [V]; gercek olup olmadigi [?] - kirmizi cizgi geregi kullanici teyit etmeli. `arkon/web/.../hazirlik.ts:61`, `istasyonlar.ts:386-397`.
- **B-031 DUSUK finans kucuk:** olu kod `toplamOdeme`, `YONTEM_HESAP_TURU` (`kurallar.ts:106,109`); oneri "acik" olunca `DELETE` (`sorgular.ts:342`); yukleme `finans.firma-oku`'ya bagli, o yetki yoksa butun yukleme duser (`kopru.ts:85,96-101`); KURAL-TEST istemci test sayisi 9 der, 10. Capraz kur yonu ON-PAKET:25 ile kod ters. [D]
- **B-032 DUSUK finans testleri baska modul tablolarina SQL yazar** (`INSERT INTO rol`, `rol_islemi`, `denetim_kaydi` okuma). [D] `para.test.ts:69-71, 445`.
- **B-033 DUSUK satin-alma:** acilista herhangi bir satin-alma islemi olana butce ve onay limitleri dahil butun ayarlar gider (`servis.ts:133-134`); hareket metni istemciden serbest (`servis.ts:203`). [D]
- **B-034 DUSUK rota belgeleri:** goc adi `20261008090000` yazar, gercegi `20261008140954`; RT-22 `rotalar.*` der, kod `rota.*` (`kurallar.ts:3-5`); ekranin cagirdigi `/vardiya-matrisi/degistir` sunucuda yok ve B17'de adiyla yok (`KaynaklarEkrani.tsx:66`). [D]
- **B-035 DUSUK malzemeler belgeleri eski:** UYUM-BORCU:42, 53, 105; GUVENLIK:15 olmayan test adi; `katalog-onay-baglama.test.ts:502` adi yaniltici; MKK-11 hic yok [?]; CEKIRDEK-ISTEKLERI madde 2 kapanmis ama acik gorunur. [D]
- **B-036 DUSUK istasyonlar belgeleri eski:** KURAL-TEST:3 ARK-IST kaynagi icin "BILMIYORUM" der, kart #31'de toplu onay var; CEKIRDEK-ISTEKLERI madde 3 kapanmis ama acik gorunur. [D]
- **B-037 DUSUK durus-nedenleri:** DN-10 hic yok [?]; simge varligi yalniz ekranda, UYUM-BORCU'da "yalniz ekranda kalan kural" diye yok (`paylasilan/sozlesme/durus-nedenleri.ts:22`); kok `BASKA-MODUL-ISTEKLERI.md:19-22` kapanmis istegi acik sayar. [D]
- **B-038 DUSUK sinir araci bosluklari:** kok `arkon/` klasoru ithal kurallariyla taranmaz (`araclar/sinir-denetimi.ts:14`); sablon dizeli dinamik ithal ve takma adli SQL cagrisi kacar (`:17-25`). Bugun ihlal yok. [D]
- **B-039 DUSUK belgesi eksik modul:** saglik ve istek-kimligi KURAL-TEST, UYUM-BORCU, ORTAKLIK yok; uretim-emirleri ORTAKLIK, FARK, KURAL-TEST, UYUM-BORCU yok (sahibi disarida: durum). [D]
- **B-040 DUSUK `yazilarKalir` ile biten ret denetim satiri birakmaz;** yarim yukleme seridinin atilmasi deftere izsiz gecer. [D] `sunucu/cekirdek/uc.ts:477-482`. ADR 0002 m5 izin veriyor olabilir [V].
- **B-041 DUSUK eskimis ADR ve yorumlar:** ADR 0001 m5 olmayan `sayfa` alanini sayar; ADR 0004 #28'i acik sayar (yapilmis, `txDisi`); `istek-kimligi/servis.ts:11` "zamanlanmis is yok" der (ADR 0010 var); `kisiler/UYUM-BORCU.md:19` eski; `dosya/isler.ts` yok, borc madde 1 zamanlayiciya tasimayi bekliyor. [D]
- **B-042 DUSUK vardiya islemleri sunucusuz modul icin rollere verilmis** (mudur, planlama). Uc olmadigi icin bugun etkisiz. [D] `sunucu/gocler/20261006221000_kisiler_vardiya_islemleri.sql`.
- **B-043 DUSUK main gecmisi [?].** Bu kapsayicinin klonunda `origin/main` 51e627c idi; fetch "forced update" verdi ve 51e627c (2026-10-07 23:32, "docs(satin-alma): align commonality note ...") 21c2b9a'nin atasi degil; bu konulu commit main'de yok. Ya main yeniden yazildi ya klon onbellegi baska bir daldan geldi. Sonraki kontrol main'in ileri sarildigini dogrulamali. [D] `git merge-base --is-ancestor 51e627c 21c2b9a` -> hayir.

Toplam: 43 bulgu (KRITIK 4, YUKSEK 8, ORTA 16, DUSUK 15).

## Acik cekirdek istekleri

| # | Modul | Istek | Kaynak | Neden acik |
|---|---|---|---|---|
| C-1 | finans | `finans.*` rol x islem satirlari | `sunucu/moduller/finans/CEKIRDEK-ISTEKLERI.md:29` | Goc yok; Asama 2, kullanici onayi |
| C-2 | satin-alma | Rol x islem matrisi (C3); onerilen `firmalar.yaz` satiri gecersiz | `sunucu/moduller/satin-alma/CEKIRDEK-ISTEKLERI.md:27-36` | Asama 2 |
| C-3 | satin-alma | Ikinci menu 768 px'ten itibaren sutun (C5) | `sunucu/moduller/satin-alma/CEKIRDEK-ISTEKLERI.md:37-38` | Sutun kipi hala 1280+ (`Kabuk.tsx:79`, `genis-ekran.ts:4`) |
| C-4 | rota | `rota.*` rol satirlari (planlama_proje, mudur, cam) | `sunucu/moduller/rota/CEKIRDEK-ISTEKLERI.md:7-15` | Goc yok, onay bekliyor |
| C-5 | arkon | #223 ince islemler (paket yayini, onay, bakim plani, sayim) | `sunucu/moduller/arkon/CEKIRDEK-ISTEKLERI.md:18` | Islemler yok; rol listeleri gecici olarak `kurallar.ts`'te |
| C-6 | uretim-emirleri (disarida) | Okuma uclarina `biri:[sayfa...]` + iki test | kok `BASKA-MODUL-ISTEKLERI.md:5-17` | `uclar.ts:17,25,33` hala 'oturum' |
| C-7 | satin-alma | `sayfa.satin-alma` talep eden ve depo rollerine | kok `BASKA-MODUL-ISTEKLERI.md:24` | Asama 2 rol karari |
| C-8 | kalibrasyon, durus-nedenleri | bilinmiyor | dosya yok | [?] B-026 |

Belgede acik gorunup kodda kapanmis olanlar (belge duzeltilmeli): arkon 1, 7; malzemeler 2; istasyonlar 3; kok durus-nedenleri istegi. Modul tarafinda tek satirla kapanacak olan: finans 6 ve 7 (B-019).

## Genel hukum

Depo mekanik olarak saglam: tip, sinir, lint ve 1999 testin tamami yesil, `uc()` disinda rota yok, moduller arasi ithal yalniz `disari.ts` uzerinden ve dongu yok. Ama yesil test kalkan degil: dort KRITIK bulgunun hicbiri testle yakalanmiyor, cunku tam o kurallarin reddeden testi yazilmamis. Asil zayiflik is kurallarinin sunucuya inmemesi: satin almada onay ve dort goz istemcinin yolladigi kimlige guveniyor, finans para hesabinin bir kismini JS float ile yapiyor ve iptalde veri eziyor, Arkon kalite kapilarini ve depo yetkisini yalniz tablette tutuyor. Satin alma ve finans islemleri bugun yalniz yoneticide oldugu icin zarar kapali kapinin arkasinda; Arkon ve uretim emirleri ise kullanima acma kapisi kapanmadan rollere verilmis, yani bu iki modulun acigi canli. Belgeler (KURAL-TEST, GUVENLIK-DENETIMI, UYUM-BORCU, CEKIRDEK-ISTEKLERI) koddan geride; denetimde belge iddiasina guvenilemez, her iddia kodla yeniden dogrulanmali. Asama 2'ye gecmeden once B-001..B-007 kapanmali; rol x islem satirlari bunlar kapanmadan verilmemeli.
