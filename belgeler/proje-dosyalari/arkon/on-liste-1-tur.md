# Arkon oturtma, Asama 1 tur 1: on liste (kod yazilmadi)

Depo: heylit/TMICOREV2 main 4a70288. Node: `node -v` -> v24.21.0 (nvm ile kuruldu; ortamda v22.22.0 vardi).
Goc sirasi (harita): 31 goc, son uc: ...222500_uretim_emirleri_tek_calisan, ...223000_arkon_tmi_yansima, ...230000_satin_alma_tablolar.
Dal: kullanicinin verdigi ad 199-arkon-oturtma. Onaydan once acilmadi.
Kaynak: `sunucu/moduller/arkon/UYUM-BORCU.md` (satir numaralariyla), kartlar GitHub'dan okundu.

## a) Acik kartlar

| Kart | Ozet | Durum |
|---|---|---|
| #243 | TMI'ye yazilamayan Arkon kayitlari (reddedildi, eslenemedi, bekliyor, hatali) mudur ve planlamaya gorunsun; kullanici karari: Arkon rollere acilmadan once. Ekranin yeri (emir ekraninda bolum mu, ayri sayfa mi) karar bekliyor. | Yazilmadi. Okuma ucu yok (UYUM-BORCU:53). |
| #248 | Iki Arkon rollu kiside rol birlesmesi; rol atamada ikinci Arkon rolu verilince uyari. Bugunku kural: tek Arkon rollu TMI rolu. | Uyari kisiler ekranindadir (benim klasorum degil). Birlesme Arkon icinde buyuk is. |
| #223 | Arkon'un ince yetkileri (paket duzenle, yayinla, onay, plan, bakim...) TMI islemleri olsun, rollere TMI'den verilsin; depo x rol tablolari bu islemlerden turesin. | Ara adim kapandi (#215: kv/perms yazimi 403, matris sunucudan, UYUM-BORCU:18). Kalani: yeni islemler (paylasilan/islemler, cekirdek) + rol satirlari (kisiler) + Arkon tablolarinin islemden turemesi (benim). |
| #224 (soru) | Yeni `bakim` rolu, `arkon.bakim` ona. | Karar verilmis (karta 19:58 yorumu, matris onayli). Kod `224-bakim-rolu-ve-arkon-rolleri` dalinda, cekme istegi yok, main ile CAKISIYOR (goc damgasi 20261007230000 satin_alma ile ayni; dogrulandi: `git merge-tree` cakisma). |

## b) UYUM-BORCU siniflari

### KULLANIMI TUTAN (yetki acigi, veri kaybi, yanlis sayi)
1. Hicbir role Arkon verilmedi: `sayfa.arkon` ve `arkon.*` main'de hicbir rolde yok (dogrulandi: grep, goclerde yok; UYUM-BORCU:67). Operator Arkon'a giremez, akis A yalniz yoneticiyle kosulur. Kapanis: #224 dalinin birlesmesi (kisiler, benim degil).
2. Sayim `running` olayindan once varirsa ret kalici (UYUM-BORCU:40 c): ekran olay ve sayimi ayri istekle yollar; planli emre sayim TMI'de reddedilir ve yeniden denenmez -> TMI'de eksik sayi. Arkon tarafinda duzeltilebilir: "emir henuz baslamadi" retti `bekliyor` sayilir, ayni emrin onundeki `running` yansiyinca yeniden denenir.
3. Sessiz kayip (UYUM-BORCU:85): reddedilen belge ve kayit yalniz tabletin IndexedDB'sinde kalir, kuyruktan duser, kullaniciya gosterilmez (`arkon-rejected` olayini dinleyen yok). Arkon tarafinda: reddi ekranda gostermek ve kuyruktan dusen ogeyi saklamak (arkon/web, benim klasorum; ekranda en az dokunus: tek uyari seridi).
4. Ortak tablette cevrimdisi kuyruk sonraki kisinin oturumuyla gidebilir (UYUM-BORCU:101, VARSAYIM, denenmedi) -> sayim yanlis kisiye yazilir. Once denenir; dogrulanirsa kuyruk ogesine kisi kimligi eklenir, farkli oturumda gonderilmez.
5. #243 listesi: kullanici karari "rollere acilmadan once". Sunucu okuma ucu benim; islem ve sayfa kaydi cekirdekte (istek). `hatali` icin yeniden kuyruga alma komutu (UYUM-BORCU:48) bununla.
6. Depo basina yetki (UYUM-BORCU:71, 74, 77): amir periyodik bakim plani yazar; kalite paket yayinlar; hazirlik/planlama operator sonucundaki sayimi yazar; operator ve amir dolu `results` yazar; kalitenin reddettigi paket yayinlanir. Kullanici karariyla #223'e birakilmis ("kod yok"). Arkon'un kendi sunucu tablosuyla (rol bazli, islem beklemeden) alan duzeyinde kapatilabilir; ya da #223 bekler. Soru 3.

### KULLANIMI ETKILEYEN (kullanicinin gordugu hata ya da eksik)
7. Yeniden deneme yalniz yeni kayit gelince calisir, arka plan isi yok (UYUM-BORCU:40 f, 51): bekleyen sayim TMI'ye gec yansir. Cekirdekte zamanlayici kalibi ister (#208, beklemede).
8. Arkon `queued` -> TMI'de emir "basladi" kalir; istasyonda tek calisan emir kurali yeni emri reddettirebilir (UYUM-BORCU:40 d, 52). #241'in kalani; uretim-emirleri'nden istek.
9. Hurda eksi duzeltme TMI'ye yansimaz, TMI toplami fazla kalir (UYUM-BORCU:40 b). Uretim-emirleri'nden hurda duzeltme komutu istegi.
10. Kayit zamani TMI'ye tasinmaz; cevrimdisi gec gelen sayim gelis aninda sayilir (UYUM-BORCU:40 a). Uretim-emirleri'nden "olay zamani" alani istegi.
11. Arizada `openedBy` acani degil ustleneni gosterir (UYUM-BORCU:73).
12. Menu maddesi gorunurlugu kaba: rol verilince operator gormedigi maddeye tiklayinca ilk sayfaya doner (UYUM-BORCU:30).
13. Iki Arkon rollu kiside oteki rolun yetkisi duser; rol atama uyarisi yok (#248).
14. Iletiler kapsam suzmesiz herkese yayinlanir (UYUM-BORCU:80).
15. Silmede surum zorunlu degil (UYUM-BORCU:70).

### SONRA (gorunum, ic yapi, Logo / SMARTES)
16. Belge deposu jsonb, kendi dosya deposu, surum/liste/kisit kalibi disi (UYUM-BORCU:8-11).
17. Butun uclar `yetki: 'oturum'`, rol serviste (UYUM-BORCU:16) - #223 ile.
18. Denetim defterine govdenin tam girmesi (UYUM-BORCU:17), `eksikler` okumasinin komut olmasi (:102).
19. Ust duzey `arkon/` ayri derleme, tasarim degiskeni yok, `strict: false` (:22, :104); yoklamali ileti (:23); cerceve koprusu standart degil (:24); cerceve sandbox'siz (:69, #236 ile).
20. Menu sayaclari bagli degil (:29).
21. Baglamada kapanacaklar: kilit butcesi, `korumaliIsle` dogrudan testi, `emir_id` yabanci anahtari, `yeniEmirler` olu durum, P0001 testleri, kismi indeks plan testi (:45-54).
22. Dosya kotasi kilitsiz (:72); `/arkon/kisiler` butun Arkon rollerine ad listesi (:103).
23. npm audit: pdfjs-dist, tar, node-pre-gyp (:105).
24. SMARTES alanlari (:56-63), Logo (:110).

## c) Baska parcalardan beklenenler
- Kisiler / cekirdek: #224 rol dagilimi (dal hazir, cakismali); #248 rol atama uyarisi; #243 icin islem (`arkon.yansima-oku` gibi) ve mudur, planlama_proje satirlari; #223 icin ince islemler.
- Cekirdek: zamanlayici / arka plan isi kalibi (madde 7).
- Uretim-emirleri (BASKA-MODUL-ISTEKLERI.md'ye yazilacak, kullaniciya iletilecek): `queued` icin duraklat esleme (#241 kalani), hurda duzeltme komutu, olay zamani alani, yeni emir modelinde (urun emri + is emirleri) Arkon paket bagi `tmi-ue-<id>`'nin neye bagli olacagi (emir mi, is emri mi).

## d) Arkon'un uretim-emirleri/disari.ts'ten kullandiklari (sozlesme testi plani)
Dosya: `sunucu/moduller/arkon/uretim-emirleri-sozlesme.test.ts` (yalniz benim klasorum). Cagrilar `sunucu/moduller/arkon/servis.ts:14-16, 88, 321-369`.
1. `acikEmirler(db)`: yalniz planli ve baslamis emirler; bitmis ve iptal donmez. Arkon'un okudugu alanlar: id, emirNo, durum, istasyon, parcaNo, parcaAd, adet, acan, acilma.
2. `emirOzeti(db, id)`: yok -> null; var -> {id, emirNo, durum, istasyonId}; islem aramaz.
3. `emirBaslat(db, kullanici, id)`: planli -> basladi; `terminal.uret` yok -> 403; kapsam disi istasyon -> ret.
4. `emirDevam`: duraklamis -> basladi; calisan emre devam -> ret.
5. `emirDuraklat`: basladi -> duraklamis.
6. `emirDurdur(db, k, id, durusNedeniId)`: gecerli neden kabul; olmayan neden ret; duraklamis emre durdur ret (#241 sonrasi).
7. `emirSayim(db, k, id, SayimKaydi)`: saglam artar (eksi duzeltme kabul); hurda + neden artar; `AZAMI_SAYIM` asimi ve planli emre sayim ret.
8. `emirBitir(db, k, id)`: basladi -> bitti.
9. `KOMUT_ISLEMI === 'terminal.uret'`; `sayimGovdesi` semasi (`paylasilan/sozlesme/uretim-emirleri.ts`).
Her biri icin izinli ve reddedilen durum; ret `UygulamaHatasi` olarak cikar ve cagiranin transaction'ini bozmaz (kayit noktasi). Disaridan gelen surum imzayi ya da davranisi degistirirse bu test kirmizi olur.
