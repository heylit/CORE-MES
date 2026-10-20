# Asama 1, 2. tur kapanis raporu

Salt okuma: depoda dosya degismedi, commit ve dal yok. Tarih 2026-10-08.

Ana dal `7c20cef` (#272 dahil). `kontrol` bu commit'te KOSUYOR (run 271, 07:35 basladi; sonuc bu rapor yazilirken yoktu); bir onceki `cdf20ee` (#274) yesil. DOGRULANDI: GitHub Actions listesi.

Kaynaklar: `git log origin/main`; `sunucu/moduller/*/UYUM-BORCU.md`, `FARK.md`, `*-ISTEKLERI.md` (origin/main); kokteki `BASKA-MODUL-ISTEKLERI.md`;
`/mnt/project-files/tur1-raporlar/*`, `tur2-raporlar/temel-moduller.md`, `cekirdek/2-tur-kapanis-cekirdek.md`, `platform-esligi/*`, `tanim-modulleri/247-liste.md`;
proje akisi ve konu listesi. `kurulum/eski-kurallar` okunmadi.

Sayim notu (VARSAYIM): madde bolmesi benim; numarasiz borc maddelerini satir basina bir saydim. "Tutan / etkileyen / sonra" 1. tur dokumundeki tanimlarla (T, E, S).
Sayilar yaklasiktir; kanit icin her madde asagida dosya ve madde numarasiyla.

## 1. Bu turda birlesen cekme istekleri

| No | Parca | Ne | Durum |
|---|---|---|---|
| #265 | istasyonlar | surum denetimi, `istasyonAdlari`, operasyon tipi katalogu + kodlu tohum (96 tip, kullanici "kodlu liste"), okuma uclari kalibi, ikinci menu, kisi kisitlari bolumu, belgeler | birlesti |
| #270 | ci | her cekme isteginde `kontrol` | birlesti |
| #271, #275 | kurulum | proje talimati ve hedef belgeleri | birlesti |
| #272 | cekirdek | `arkon.yansima-oku` mudur ve planlama_proje; satin alma toplayici notu | birlesti (07:35, #276'dan sonra, sira dogru) |
| #273 | satin alma | acilis okuma yetkisi, toplu `firmaOzetleri`, "[uydurma firma]" isaretli testler | birlesti |
| #274 | malzemeler | tasan fark degerleri, okuma kalibi, ikinci menu, tur/onay/onek karttan | birlesti |
| #276 | arkon | liste kapsami, bekleyen sayim olaylari tikamaz, `queued` duraklatir, dolu `results`, silmede surum, `openedBy` | birlesti |
| #277 | platform esligi | `.env` tek kaynak, kabuksuz `test:modul`, `.nvmrc` 24, `GIT_DIR`, harf buyuklugu | birlesti |
| #278 | tanim modulleri | durus-nedenleri ve kalibrasyon okuma yetkisi, ikinci menu, belgeler | birlesti |
| #279 | temel moduller | kisiler, oturum, ayarlar, denetim belgeleri; kisiler ve ayarlar ikinci menu | birlesti |

Birlesmeyen 2. tur cekme istegi yok. Acik cekme istegi yok (DOGRULANDI: `list_pull_requests`, 25 son istek).

## 2. Duzen tablosu

Borc sutunu: kalan tutan / etkileyen / sonra.

| Parca | Sahibi konu | Asama | Kart ve dal | Bagli oldugu | Acik istekler | Borc T/E/S | Sana sorulanlar |
|---|---|---|---|---|---|---|---|
| Cekirdek | Cekirdek oturtma (calisiyor, 3. tur) | 1, toplandi | #259; 3. tur `259-cekirdek-3` (O1) | - | uretim-emirleri okuma uclari (UE1) | 0 / 1 / 4 | S2 kalibi (C1 onerisi) |
| Ortak arayuz | kapatildi | 1, toplandi | #172 | cekirdek | yok | 0 / 0 / 1 | yok |
| Platform esligi (araclar) | Platform esligi (calisiyor, 3. tur) | 1, toplandi | #122; 3. tur `72-harita-rol-islemi` (H1) | - | yok | 0 / 0 / 2 | yok |
| Malzemeler | kapatildi | 1, toplandi | #163; #234, #233 bekler | kisiler, ayarlar | yok | 0 / 8 / 10 | yok (M4 b: #234'e) |
| Istasyonlar | kapatildi | 1, toplandi | #186, #105 | kisiler | uretim-emirleri (UE7, UE8); malzemeler `operasyonTipleri` (Asama 2) | 1 / 5 / 3 | yok |
| Arkon | Arkon oturtma (calisiyor: Akis A denemesi) | 1, toplandi | #199, #243, #223, #248 | kisiler, istasyonlar, durus-nedenleri, uretim-emirleri | uretim-emirleri UE2-UE6; kisiler #248 uyarisi; cekirdek yineleyici (C3), #223 ince islemler | 0 / 12 / 23 | yok |
| Satin alma | kapatildi | 1, toplandi | #162 | kisiler, finans (yok), malzemeler (bagsiz) | finans dort fonksiyon; stok cakismasi | 3 / 6 / 12 | rol matrisi, mal kabul, firma bagi (sonraya ayirdin) |
| Tanim: durus-nedenleri | kapatildi | 1, toplandi | #247 | - | gelen yok | 1 / 1 / 3 | rol: yalniz yonetici (kararin) |
| Tanim: kalibrasyon | kapatildi | 1, toplandi | #247 | kisiler | gelen yok | 1 / 2 / 4 | rol: yalniz yonetici (kararin) |
| Temel: kisiler | Temel moduller (calisiyor, 3. tur `259-temel-moduller-3`) | 1, toplandi | #259 | - | Arkon #248 uyarisi | 0 / 3 / 5 | yok (K1-K4 cevapli) |
| Temel: oturum | ayni | 1, toplandi | #259 | kisiler | yok | 0 / 0 / 4 | yok |
| Temel: ayarlar | ayni | 1, toplandi | #259 | denetim | yok | 0 / 0 / 5 | yok |
| Temel: denetim | Denetim okuma ekrani (calisiyor, `48-denetim-okuma`) | 1, toplandi | #259, #48 | - | yok | 0 / 1 / 1 | yok |
| Uretim emirleri | disarida (dis sohbet) | depoda eski hali | - | istasyonlar, kisiler, durus-nedenleri | asagida UE1-UE11 | BILMIYORUM (UYUM-BORCU yok) | yazim yok (kural) |

Kapsamdaki ama depoda olmayan parcalar (rota, plan, finans, stok ve depo, vardiya ve mesai): konu yok, kart ve basvuru bekliyor.

## 3. Parca basina kapanan ve kalan borc

### Cekirdek
- Kapanan (bu tur, #272): E3 `arkon.yansima-oku` rol satiri; E4 `LIKE 'arkon.%'` denetimi takilmiyor (test: `sunucu/moduller/arkon/arkon.test.ts:256`). Toplayici satirlari modullerin kendi isteklerinde girdi (dar istisna).
- Kalan tutan: 0.
- Kalan etkileyen (1): satin alma denetim kaydinda onceki deger (S2; ozet secici yalniz govdeyi goruyor, `sunucu/cekirdek/uc.ts`; satin alma `CEKIRDEK-ISTEKLERI.md` C2).
- Kalan sonra (4): arka plan yineleyici (C3, kararin: borcta); #157 defter haklari; #169 liste ve zaman kalibi; #82 dosya saklama.

### Ortak arayuz
- Kapanan: bu turda is yok.
- Kalan sonra (1): #172 kalanlari (tarih/saat secici, dosya yukleme, disa aktarma, grafik, bildirim yuvasi).

### Platform esligi
- Kapanan (#277): `.env` tek kaynak, `test:modul` iki platformda kabuksuz, `.nvmrc` 24, `GIT_DIR` sizintisi, Windows harf buyuklugu.
- Kalan sonra (2): hicbiri Windows'ta dogrulanmadi (senin yerel kosun bekliyor); `teslim-incele.ts` `split('\n')` CRLF'de `\r` birakir (`platform-esligi/1-tur-liste.md` satir 31, dort komutun disinda). VARSAYIM: yeniden normallestirme gerekmez, liste CRLF saklanan dosya sayisini 0 veriyor.
- 3. tur: #72 harita (onayli, H1).

### Malzemeler
- Kapanan (#274): 30 satiri asan farkta deger gorunur (#226); okuma uclari `{ biri: ['sayfa.malzemeler'] }`; ikinci menu (alti madde); tur, onay durumu, onek karttan (E16 kismen).
- Kalan tutan: 0.
- Kalan etkileyen (8): benzersiz anahtar ve mukerrer gerekcesi hala istemci ozetinden (madde 1); ekranda kalan kurallar (madde 4); Excel, QR, belge yukleme kapali (madde 5); cihazda indirme, yazdirma, kamera denenmedi (madde 7); dort goz degisiklik talebinde yalniz ekranda (2c kalsin); mudurun gorup degistiremedigi anahtar (#234'e, M4 b); "Kayit yapilamadi" bilinen sinirlari; prototip kendi icinden gorunum degisince menu ve adres degismez (madde 6, yeni).
- Kalan sonra (10): ekran stili lint disi; surum/liste/kisit kaliplari (#90, #169, #168); sablon ve ayar surumsuz; sablon silme dugmesi herkese (#234); kart icerik farki denetimden okunmaz; NOTLAR ve sozlesmede yaniltici cumle; MKK-10 yari mamul/mamul/demirbasta anahtar null; Logo alanlari (#205); stok kodu 24 veritabani kisiti; `aktif_oldu` iz birakmamis eski kart.

### Istasyonlar
- Kapanan (#265): T2 okuma uclari (`sayfa.istasyonlar` ya da `istasyonlar.yaz`); T9 ikinci menu; E14 kisi kisitlari bolumu; ayrica surum denetimi (IS9), `istasyonAdlari` (#186), operasyon tipi katalogu ve kodlu tohum.
- Kalan tutan (1): ekip ve yuzdeli kapasite (#105) ayri ve eski dalda; Akis B oncesi. Sonraya ayirdin.
- Kalan etkileyen (5): ekran 360/768/1280'de denenmedi; kisi kisitlari `kisiler.oku` olmayan rolde sunucu iletisi gosterir; operasyon tipi katalogunun ekrani ve yazma ucu yok (I3); kisi kisiti son yazan kazanir; Arkon tesis kodlarini metinle tutar.
- Kalan sonra (3): test `kisi` tablosuna dogrudan yazar; `disari.ts` tipleri surum tasimaz; ekranin `BOLUMLER` tablosu menu adreslerini tekrar eder.

### Arkon
- Kapanan (#276): T6 `queued` -> duraklat; E2 bekleyen sayimin ardindaki olaylar tikanmaz; #243 listesinde veri kapsami, kisi ve ic hata donmez; E10'dan uc madde (dolu `results` yalniz kalite ve yonetici, silmede surum zorunlu, `openedBy` cagriyi acan).
- Kalan tutan: 0 (Arkon rolleri #266 ile, yansima okuma #272 ile acik).
- Kalan etkileyen (12): arka plan yineleyici yok (C3); baslama hic gelmezse sayim bekler; `hatali` yansima kalici, yeniden kuyruk yok; reddedilen icerik saklanmaz (sessiz kayip kalani); kisi bir daha girmezse kuyruk ogesi tablette kalir; depo basina yetki (#223); `apOk` `updatedAt` denetimi yok; cerceve `sandbox` yok, kok `<svg>` zorunlu degil, ileti kapsam suzmesi yok; ikinci menu madde gorunurlugu kaba; tarayici verisi cikista silinmiyor (dogrulanmadi); tesis kodlari metin, yabanci anahtar yok; durmus emir kuyruga alininca istasyon kilitli kalir (UE2'ye bagli).
- Kalan sonra (23): ikinci menu sayac ucu yok (N10, kullanici karari 08.10.2026: sonraya); 1. tur dokumundeki liste aynen (jsonb belge deposu, kendi dosya deposu, kalip disi surum/liste/kisit, butun uclar `oturum` + `rolGerekli`, ust duzey `arkon/` ve ayri derleme, ileti yoklamasi, kilit butcesi, testsiz `korumaliIsle`, `emir_id` yabanci anahtari, olu `yeniEmirler`, P0001 testleri, plan testi ortama duyarli, `sonuc <> 'yazildi'` dizini, dosya kotasi kilitsiz, SMARTES alanlari, `eksikler` komut, `/arkon/kisiler` `kisiler.oku` aramaz, `strict: false`, `npm audit` uc kayit, denetimde belge govdesi tam).

### Satin alma
- Kapanan (#273): acilis ucu okuma kalibi (madde 22); firma toplu okuma; uydurma firmali testler isaretli (madde 3).
- Kalan tutan (3, hepsini sonraya ayirdin): T3 rol x islem satiri yok (`sayfa.satin-alma` da hicbir rolde degil); T4 finans yok, yeni tedarikci eklenemez; T5 mal kabul sahipligi (stok mu, satin alma mi).
- Kalan etkileyen (6): teklif fiyati denetime tam giriyor (S2, cekirdek bekliyor); `satin_alma_katalog.malzeme_id` bagsiz; menu sayaclari yok; acilis sayfasiz ve bolunmedi; alt kayit surumu ve uuid kimlik (madde 8); veri kapsami uygulanmiyor (madde 12, VARSAYIM).
- Kalan sonra (12): `kisitKorumali` yok; Logo alanlari ve `siparis_no`; duz DOM ekran, 41 `innerHTML`; 6 satir ici stil, uc genislik olculmedi; canli guncelleme yok (bilgi); ekran cizim testi yok; olu yedek/TCMB isleyicileri; bos durum metni yanlis; testler `firmaKaynagi`'na bagli; `GET /satin-alma-teslimleri` sayfasiz; `talep-ac` en zayif islem kalibi (madde 7); NOTLAR aynen.

### Tanim modulleri
- Kapanan (#278): durus ve hurda nedenleri okuma `{ biri: ['sayfa.durus-nedenleri', 'sayfa.terminal'] }`; kalibrasyon okuma `sayfa.kalibrasyon` ya da `kalibrasyon.oku`; iki modulde ikinci menu; Arkon'un `disari.ts` okumasini sabitleyen test (DN-S5); belgeler.
- durus-nedenleri kalan: T 1 (rol satiri yok, kararin: yalniz yonetici) / E 1 (surum yok) / S 3 (Arkon neden kopyasi Asama 2; tablo adi oneki; NOTLAR ertelenenler).
- kalibrasyon kalan: T 1 (rol satiri yok; kalite rolu olcu aletlerini acamaz) / E 2 (surum yok; `kalibrasyon-kaydet` tekrar korumasiz, defter geri alinamaz) / S 4 (olcu aleti uc yerde; `disari.ts` cagirani yok; tablo adi; NOTLAR ertelenenler).

### Temel moduller
- Kapanan (#279): dort modulde UYUM-BORCU, ORTAKLIK, GUVENLIK-DENETIMI; kisiler ve ayarlar ikinci menu.
- kisiler kalan: T 0 / E 3 (surum, `POST /kisiler` tekrar, `disari.ts` yazma komutlari; ucu de 3. turda onayli) / S 5 (`rol_islemi` harita, 3. turda #72; tablo oneki kalici istisna K1; adsiz kisitlar; rol x islem satirlari kisiler adli goclerde, not; KURAL-TEST yok).
- oturum kalan: 0 / 0 / 4 (tablo oneki istisna; adsiz kisit; kullanilmayan `beklemede` degeri; KURAL-TEST yok).
- ayarlar kalan: 0 / 0 / 5 (tablo oneki; surum yok; jsonb deger; okuma yazma islemini ister; KURAL-TEST yok).
- denetim kalan: 0 / 1 (okuma ekrani, 3. turda #48) / 1 (KURAL-TEST yok).

### Toplam (kalan)
Tutan 6 (satin alma 3, istasyonlar 1, tanim 2; uretim-emirleri bilinmiyor; hepsi senin kararinla sonraya ayrilmis), etkileyen 39, sonra 77.
1. tur sonunda tutan 9 idi: T1, T2 (uretim-emirleri disinda), T6, T8, T9 kapandi; T3, T4, T5, T7 kararla duruyor; 2. turda tanim modullerinin iki rol maddesi eklendi.

## 4. Biriken istekler

### Uretim emirleri (disarida; bu projeden yazim yok)
| Kod | Isteyen | Istek | Kaynak |
|---|---|---|---|
| UE1 | cekirdek | `GET /uretim-emirleri`, `GET /uretim-emirleri/:id` -> `{ biri: ['sayfa.uretim-emirleri'] }`; `GET /terminal/isler` -> `{ biri: ['sayfa.terminal'] }`; her uca izinli ve reddedilen test. Bugun uclar `yetki: 'oturum'`: sayfasi olmayan rol okuyor | `BASKA-MODUL-ISTEKLERI.md` (kok) |
| UE2 | arkon | `emirOzeti`'ne istege bagli `calisma` alani (`calisiyor`, `durakli`, `durdu`); durmus emir kuyruga alininca istasyon kilitli kaliyor | `arkon/BASKA-MODUL-ISTEKLERI.md` 1 |
| UE3 | arkon | hurda eksi duzeltme: `emirSayim` eksi hurdayi kabul etsin ya da ayri komut; TMI hurda toplami fazla kaliyor | ayni, 2 |
| UE4 | arkon | komutlara istege bagli `olayZamani`; cevrimdisi sayim varis aninda sayiliyor | ayni, 3 |
| UE5 | arkon | KARAR (kullanici, 08.10.2026): Arkon paketi IS EMRINE baglanir; operator is emrinde calisir, uretim emri urun icindir. Istek: yeni modelde `acikEmirler`, `emirOzeti` ve emir komutlari is emri kimligiyle calissin; `tmi-ue-<id>` is emri kimligini tasir | ayni, 4 |
| UE6 | arkon | istege bagli `emirAdlari(db, idler)` (acil degil) | ayni, 5 |
| UE7 | istasyonlar | `adlariAl` butun istasyonlari cekmek yerine `istasyonAdlari(db, idler)` | `istasyonlar/BASKA-MODUL-ISTEKLERI.md` 2 |
| UE8 | istasyonlar | operasyon tipi tasinacaksa `operasyonTipleri(db)`, bag `istasyonlar_operasyon_tipi.id` | ayni, 3 |
| UE9 | cekirdek, arkon | `disari.ts` imzalari (`acikEmirler`, `emirOzeti`, `emirBaslat`, `emirDevam`, `emirDuraklat`, `emirBitir`, `emirSayim`, `emirDurdur`, `KOMUT_ISLEMI`) korunsun; degisirse Arkon sozlesme testi kirilir | kok istek 5; `arkon/uretim-emirleri-sozlesme.test.ts` |
| UE10 | cekirdek | UE1 gelince `arkon/yansima.test.ts`'in HTTP ile okuyan test kullanicisi sayfa islemi tasimali | kok istek 4 |
| UE11 | etki raporu | yeni model: urun emri tablosu ve `uretim_emri`'ye ust emir sutunu (dolu tablo, soru kademesi); `emir_adimi` -> is emri; `parca_no` serbest metin, malzeme kartina bag yok (Akis A ilk adimi) | `cekirdek/259-liste-ve-etki-raporu.md` satir 58-75 |

Teslim belgeleri (UYUM-BORCU, ORTAKLIK, FARK) uretim-emirleri modulunde yok (DOGRULANDI: `git ls-tree`); dis yazim bunlarla gelmeli.

### Durus nedenleri
- Okuma yetkisi istegi KAPANDI (#278; `durus-nedenleri/uclar.ts`).
- Yeni gelen istek yok. Acik kalanlar istek degil, karar: rol satiri yok (kararin: yalniz yonetici); surum yok (kararin: borcta).
- Asama 2 icin not: Arkon `kv/reasons`, `kv/scraps` salt okuma kopyasi; tek kaynak bu modul. SMARTES neden kodu karsiligi alani yok (Arkon `UYUM-BORCU` SMARTES 4; bu turun isi degil).
- Uretim-emirleri `uretim_olayi.durus_nedeni_id`, `uretim_sayimi.hurda_nedeni_id` ile yabanci anahtarla bagli; `disari.ts` imzalari korunmali (Arkon ve uretim-emirleri okuyor).

## 5. 3. tura eklenmesini onerdiklerim (onayinla girer)

Onayli dort isi (K3 ve tekrar korumasi ve `disari.ts`, denetim ekrani, IKINCI_MENULER bolme, #72) tekrar etmedim.

| Kod | Oneri | Neden | Parca |
|---|---|---|---|
| N1 | Arkon kalan guvenlik: ileti kapsam suzmesi, kok `<svg>` zorunlulugu yerine kok etiketsiz parcayi da kapsayan denetim, cerceve `sandbox` icin once etki listesi | Arkon artik rollere acik; bunlar tek kalan guvenlik maddeleri | arkon |
| N2 | Arkon `hatali` yansimayi yeniden kuyruga alan komut (#243'un yazma yarisi), ayri islem ve testle | bugun hatali satir kalici; mudur listede gorur ama duzeltemez | arkon |
| N3 | Arkon `yetki: 'oturum'` uclarinin gozden gecirilmesi ve `/arkon/kisiler`'in `kisiler.oku` istemesi (yalniz liste, sonra yaz) | cekirdegin 2. onerisi; roller acildi | arkon (+ cekirdek gorusu) |
| N4 | S2 karari icin cekirdekte `denetimEki` kalibi (satin almanin onerisi a), ardindan satin alma fiyat kaydi | kararin var, kalip yok; fiyat bugun denetime tam giriyor | cekirdek, sonra satin alma |
| N5 | Rol matrisi taslagi (salt okuma rapor): satin alma, durus-nedenleri, kalibrasyon, ikinci menu maddeleri; tek tablo, karar senin | sonraya ayrilan uc tutan maddenin karari tek listede sorulsun | rapor |
| N6 | Ortaklik tablosunu 12 module genislet (tanim ve temel modullerin ORTAKLIK dosyalari eklendi), Asama 2 sahiplik soru listesi | 1. tur tablosu 6 modulle cikti | rapor |
| N7 | 360/768/1280 olcum raporu (ekranlara dokunmadan, tarayicida): istasyonlar, satin alma, malzemeler, tanim ve temel modul ekranlari | kural 6; birden cok modulde "olculmedi" | rapor |
| N8 | Kalibrasyon `kalibrasyon-kaydet` tekrar korumasi | defter yalniz ekleme alir, cift gonderim geri alinamaz; borcta kalsin dedigin madde, yeniden soruyorum | kalibrasyon |
| N9 | Eksik `KURAL-TEST.md`: kisiler, oturum, ayarlar, denetim (belge, kod yok) | sartname teslim belgesi; dort modulde sonra borcu | temel moduller |
| N10 | Arkon ikinci menu sayac ucu (Hazirlik, Kalite bekleyen sayilari) | KARAR: sonraya; Arkon borcunda "sonra" | arkon |

## 6. Kosulan komutlar
- `git fetch origin main`, `git log`, `git ls-tree`, `git show`, `git grep` (origin/main `7c20cef`).
- Calistirilmadi: `npm run harita`, `tip`, `lint`, `sinir`, testler (salt okuma rapor; `git checkout` bu oturumda izin almadi).

## 7. Varsayimlar
- Sayim ve siniflama benim; 1. tur dokumunun T/E kodlariyla izlenebilir.
- #272'nin `LIKE 'arkon.%'` testi `arkon.test.ts:256` ile karsilandi sayildi.
- Platform esliginde yeniden normallestirme gerekmedigi `1-tur-liste.md`'deki "CRLF saklanan dosya: 0" satirina dayaniyor.
