# Tanim modulleri (kart #247, dal 247-tanim-modulleri): on liste

Depo `origin/main` 9b6582f (koordinatorun verdigi 8bf861a'dan yeni). `npm ci` ve `npm run harita` cikis 0.
Goc sirasi (33): ilk `20261005120000_kisiler.sql`, son `20261008013200_kisiler_malzemeler_tanim_islemi.sql`.
Okunan: CLAUDE.md, `kurulum/dis-modul-sartnamesi.md`, ADR 0006 ve 0007, `paylasilan/ikinci-menu.ts`, iki modulun sunucu, istemci ve paylasilan dosyalari, `BASKA-MODUL-ISTEKLERI.md` (cekirdegin #247 notu).

## 1. DUZEN'in alti maddesine gore durum

| Madde | durus-nedenleri | kalibrasyon |
|---|---|---|
| 1 Yer | Uygun: kendi klasorleri, kendi gocu `20261006164439_durus_nedenleri_tablolar.sql` | Uygun: kendi klasorleri, kendi gocu `20261006104020_kalibrasyon_tablolar.sql` |
| 2 Kimlik | Ana menude tek sayfa (`/durus-nedenleri`, Tanimlar) uygun. Ikinci menu YOK: ekran kendi sekme seridini ciziyor (`DurusNedenleri.tsx` `SEKMELER` durus/hurda). Islem `durus-nedenleri.yaz` uygun. Tablo adlari `durus_nedeni`, `hurda_nedeni` modul adiyla baslamiyor | Ana menude tek sayfa (`/kalibrasyon`, Kalite) uygun. Ikinci menu YOK: kendi sekmeleri (`OlcuAletleri.tsx` `SEKMELER` aletler/turler). Islemler `kalibrasyon.oku`, `kalibrasyon.yaz` uygun. Tablo adlari `olcu_aleti`, `olcu_aleti_turu` modul adiyla baslamiyor; `kalibrasyon_kaydi` uygun |
| 3 Sahiplik | Uygun: baska kavram kopyalamiyor. Arkon kendi neden listesini tutuyor (`kv/reasons`, `kv/scraps`, salt okuma); Asama 2 konusu | Kisi adi kisiler `disari.ts` ile (NOTLAR.md). Arkon'da ikinci alet kaydi (`gauges`), malzemeler demirbasinda `kalAy/sonKal` var; Asama 2 konusu |
| 4 Yon | Bagimli oldugu modul yok; ona bagli: arkon, uretim-emirleri. Dongu yok | Bagimli oldugu: kisiler; ona bagli yok. Dongu yok |
| 5 Guvenlik | Her yazma ayri uc ve kendi islemiyle (4 uc). Okuma uclari `yetki: 'oturum'` (acik). Surum denetimi YOK (guncelle uclari). Yazma testleri izinli/ret var (DN-S3) | Her yazma ayri uc (7 uc). Okuma uclari `kalibrasyon.oku` (kapali, uygun). Kayit kisisi sunucudan (`kullanici.id`), zaman veritabanindan. Surum denetimi YOK (alet ve tur guncelle). Tekrar korumasi YOK (`kalibrasyon-kaydet` cift gonderimde iki kayit) |
| 6 Belgeler | `NOTLAR.md` var; `UYUM-BORCU.md`, `ORTAKLIK-durus-nedenleri.md`, `GUVENLIK-DENETIMI.md` YOK | `NOTLAR.md` var; `UYUM-BORCU.md`, `ORTAKLIK-kalibrasyon.md`, `GUVENLIK-DENETIMI.md` YOK |

Tumu DOGRULANDI: `npm run harita -- --modul <ad>` ciktisi ve adi gecen dosyalar.

## 2. Okuma uclarinin yetkisi

- durus-nedenleri: `GET /durus-nedenleri`, `GET /hurda-nedenleri` `yetki: 'oturum'` (`uclar.ts`). Ekrandan okuyanlar: kendi sayfasi ve terminal (`istemci/src/moduller/terminal/Terminal.tsx:86,91`). Arkon ve uretim-emirleri `disari.ts` ile okur, uc katmanindan gecmez. DOGRULANDI (grep).
  Yazacagim: `yetki: { biri: ['sayfa.durus-nedenleri', 'sayfa.terminal'] }` (cekirdegin onerisi, `BASKA-MODUL-ISTEKLERI.md` "durus-nedenleri"). Iki uc icin iki test: listedeki islemi olan 200, olmayan 403. Mevcut `DN-S3` testi "okuma oturumlu herkese acik" diyor; yeni kurala gore degisir (zayiflamaz, sikilasir).
- kalibrasyon: `GET /olcu-aletleri`, `/olcu-aletleri/:id`, `/olcu-aleti-turleri` `kalibrasyon.oku`. Acik yok; ama sayfasi olan (`sayfa.kalibrasyon`) ve `kalibrasyon.oku` tasimayan rol ekranda 403 alir.
  Varsayim: `yetki: { biri: ['sayfa.kalibrasyon', 'kalibrasyon.oku'] }`; `kalibrasyon.oku` kalir (ADR 0007 madde 5: ayri okuma islemi tutulabilir; silmek kayitli islemi kaldirmak olurdu). Geri alma maliyeti dusuk: tek satir ve iki test. Testler: yalniz sayfa islemi olan 200, ikisi de olmayan 403.
- Rol satiri: bugun hicbir rolde `sayfa.durus-nedenleri`, `sayfa.kalibrasyon`, `durus-nedenleri.yaz`, `kalibrasyon.*` yok; iki modul yalniz yoneticide (goclerde grep). Rol dagilimi senin kararin; bu dal rol satiri yazmaz.

## 3. Ikinci menu (veri; modulun kendi `paylasilan/sayfalar/<ad>.ts` dosyasinda)

- durus-nedenleri: kok `/durus-nedenleri`; maddeler `durus` "Durus nedenleri" (`/durus-nedenleri`, simge pause), `hurda` "Hurda nedenleri" (`/durus-nedenleri/hurda`, simge alert); ikisinin islemi `sayfa.durus-nedenleri`.
- kalibrasyon: kok `/kalibrasyon`; maddeler `aletler` "Aletler" (`/kalibrasyon`, ruler), `turler` "Turler" (`/kalibrasyon/turler`, list); islem `sayfa.kalibrasyon`. Sayac ucu yok.
- Ekrana dokunus: yalniz sekme seridi kalkar, bolum adresten secilir; `rotalar.tsx`'e alt yol eklenir. Tablo, form ve duzen ayni kalir (sartname: kendi menusunu ciziyorsa yalniz menu kabuga tasinir).
- Toplayici satiri cekirdek konusuna istek: `paylasilan/sayfalar.ts` `IKINCI_MENULER`'e `DURUS_NEDENLERI_IKINCI_MENU`, `KALIBRASYON_IKINCI_MENU`. Istek dosyasi dalda `CEKIRDEK-ISTEKLERI.md` olarak gelir.

## 4. Eksik belgeler (yazilacak)

Her modulde: `UYUM-BORCU.md` (tutan / etkileyen / sonra siniflariyla), `ORTAKLIK-<ad>.md` (tablo ve sutun adiyla), `GUVENLIK-DENETIMI.md` (her uc: yol, islem, sunucu kurallari, izinli test, reddeden test; yalniz ekranda kalan kural). Dal kokunde `CEKIRDEK-ISTEKLERI.md`.

## 5. Kullanimi tutan / etkileyen / sonra

Tutan:
1. durus-nedenleri okuma uclari oturumla acik (yetki acigi). Bu dalda kapanir.
2. Iki modulde ikinci menu yok (Asama 1 sarti). Bu dalda kapanir, toplayici satiri cekirdekte.
3. Hicbir rolde bu modullerin islemleri yok: kalite ve bakim kendi tanimlarini acamaz. Rol kararin; borca yazilir.

Etkileyen:
4. Surum denetimi yok (durus/hurda guncelle, alet ve tur guncelle): iki kisi ayni anda duzenlerse son yazan kazanir. Surum sutunu dolu tabloya sutun ekler; borca yazilir, bu dalda yok.
5. `kalibrasyon-kaydet` icin istek kimligi yok: cift gonderim iki kayit yazar. Borca yazilir.

Sonra:
6. Tablo ve dizin adlari modul adiyla baslamiyor (`durus_nedeni`, `hurda_nedeni`, `olcu_aleti`, `olcu_aleti_turu`). Dolu tabloyu degistirir; borca yazilir, karar senin.
7. Arkon'daki neden ve alet kopyalari, malzemeler demirbasindaki kalibrasyon alanlari: Asama 2 sahiplik tablosu.
8. Mevcut kararla ertelenenler (NOTLAR.md): DN-02 olcumu, sira degistirme ucu, sertifika eki, disa aktarma.

## 6. Dokunulacak ve dokunulmayacaklar

Dokunulacak: `sunucu/moduller/{durus-nedenleri,kalibrasyon}/`, `istemci/src/moduller/{durus-nedenleri,kalibrasyon}/`, `paylasilan/sayfalar/{durus-nedenleri,kalibrasyon}.ts`, dal kokunde `CEKIRDEK-ISTEKLERI.md`.
Dokunulmaz: `disari.ts` imzalari (Arkon ve uretim-emirleri kullaniyor), sozlesme dosyalari, gocler, toplayicilar, rol satirlari, `istemci/src/ortak`, terminal, arkon, uretim-emirleri.
Kosulacak: `npm run tip`, `lint`, `sinir -- --modul <ad>`, `test:modul -- <ad>` (iki modul icin).
