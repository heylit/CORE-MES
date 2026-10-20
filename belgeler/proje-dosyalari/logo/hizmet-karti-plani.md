# Logo hizmet karti gonderimi: yazim plani (kart #207, PR #339)

Durum: yazilmadi, onay bekliyor. Hizmet turu malzemelerde ana dala girmeden kod yazilmaz (DOGRULANDI: origin/main 6e04d3e'de `hizmet` turu yok).
Dayanak: kullanici cevaplari KH1-KH4 (09.10.2026), kullanici karari "fason rota adimidir" ve madde 7.

## 1. Gonderim kapali kalir (KH1 karari)
- Hizmet gonderimi kodda kapali bir isaretle durur: `HIZMET_VAR_MI_YOLU = null`. Yol bos oldugu surece hizmet kartina hicbir istek
  gitmez, satir yazilmaz, kart "bekliyor" kalir. Acmak icin kod degisikligi gerekir; "var mi" ucu dogrulaninca yol yazilir ve acilir.
- Neden Sistem Ayarlari anahtari degil: anahtar olsaydi "var mi" ucu dogrulanmadan da acilabilirdi. Kullanicinin kurali bunu yasakliyor.
- Secenek (LH1 sorusu): a) kodda kapali (onerim) b) Sistem Ayarlari'nda ayri anahtar, varsayilan kapali.
- Iki anahtar yine gecerli: "Logo baglantisi" kapaliysa ya da ortam degiskeni yoksa hizmet de gitmez.

## 2. Kopru istemcisi (kopru.ts, tek ic arayuz)
- `hizmetVarMi(kod)`: yolu BILMIYORUM. Yol bos oldugu icin cagrilmaz.
- `hizmetEkle(yon, govde)`: alinan hizmet POST /api/PurchaseService/AddRich (kilavuz), verilen hizmet POST /api/SalesService/AddRich (VARSAYIM).
- Govde alan adlari tek bir haritada durur ve "dogrulanmadi" diye isaretlenir. Kilavuz yalniz XML etiketlerini veriyor: CODE, DESCRIPTION, CARD_TYPE,
  UNITSET_CODE, VAT_PERC, AUXIL_CODE. JSON adlari bilinmiyor; malzemedeki adlar (code, name, cardType) VARSAYILMAZ. Haritadaki gecici adlar
  XML etiketlerinin kendisidir (CODE, DESCRIPTION...). Dogrulaninca yalniz harita degisir.
- Gonderilen alanlar: kod (en cok 24, dogrulanmadi), ad, kart turu (alinan 1, verilen 2), birim seti, KDV (VAT_PERC; ayar bossa yok), ozel kod "TMI".

## 3. Ayarlar
- Yeni sayi ayari `logo.hizmet-kdv-orani` ("Logo: hizmet KDV orani"), varsayilan bos, 0-100, 2 ondalik; bossa VAT_PERC gonderilmez (KH3 b).
- Bilinen sinir: cekirdegin `ayar_deger_dolu` kisiti yuzunden yonetici bir deger girdikten sonra ayari yeniden bosaltamaz. Bu gerekirse
  CEKIRDEK-ISTEKLERI 6a geri acilir (soru LH2).

## 4. Giden kutusu
- `logo_giden.belge_turu` kisitina 'hizmet' eklenir. Goc bu dalda henuz birlesmedigi icin ayni goc dosyasi duzeltilir; tablo hicbir yerde dolu degil.

## 5. Malzemeler yazarina istekler (BASKA-MODUL-ISTEKLERI)
- Kuyruk (`logoyaGidecekMalzemeler`): hizmet karti kuyruga girer; `hizmetYonu` alani gelir; hizmet icin `tur_karsiligi` eksik sayilmaz.
- Tur karsiligi tablosuna hizmet girmez (kisit).
- "Logo gonderimi" sayfasi: hizmet karti "bekliyor" iken "Hizmet karti baglantisi bekliyor" rozeti cikar; Logo sonucu yazilinca normal durum
  gorunur. Sayfa logo ucuna baglanmaz, `hizmetGonderimi` alani yok (malzemeler karari, 09.10.2026).
- Kuyruk hizmet satirlarini yalniz `{ hizmetDahil: true }` ile verir; varsayilani haric. Logo bayragi hizmet gonderimi yazilinca verir.

## 6. Testler (her kural once kirmizi)
- Saf: hizmet govdesi alan haritasindan kurulur; yon 1/2'ye cevrilir; KDV bossa VAT_PERC yok; yon bossa ya da 24'u asan kodda govde cikmaz.
- Saf: hizmet karti malzeme govdesine hic girmez.
- Uctan uca (sahte kopru): gonderim kapaliyken hizmet karti icin istek yok, satir yok, kart bekliyor; malzeme kartlari ayni turda gitmeye devam eder.
- Uctan uca (test icin yol verilerek): exists, sonra AddRich; dogru yola (Purchase/Sales) gider; cift acma kalkani hizmette de gecer.
- Sahte kopruye hizmet uclari eklenir; uretim kodu sahte kopruyu ithal etmez (var olan denetim).

## 7. Gercek kopruyle dogrulanacaklar listesine eklenecekler
Hizmet "var mi" ucu (kopru sahibine: var mi, yoksa eklenebilir mi); hizmet AddRich JSON alan adlari; SalesService yollari; CARD_TYPE ve
UNITSET_CODE zorunlulugu; hizmet kod uzunlugu; ayni kodun Logo'da iki tabloda birden bulunup bulunamayacagi.

## Sorular
- LH1: Hizmet gonderiminin kapali isareti nerede dursun? Neden: kullanicinin kurali "var mi ucu dogrulanmadan acilmaz".
  a) Kodda; acmak kod degisikligi ister (onerim). b) Sistem Ayarlari'nda ayri anahtar, varsayilan kapali.
- LH2: Hizmet KDV ayarina bir kez deger girilince yeniden bosaltilamiyor (cekirdek kisiti). Neden: kurala gore bossa KDV gitmez.
  a) Simdilik boyle kalsin; gerekince cekirdek istegi acilir (onerim). b) Simdi cekirdek istegi ac (ayar tablosunda bos degere izin, goc).

## Kararlar (kullanici, 09.10.2026)
- Plan onayli; yazim, malzemelerde hizmet turu ana dala girince.
- LH1 a: kapali isaret kodda; Sistem Ayarlari'nda anahtar yok. Alinan (`PurchaseService`) ve verilen (`SalesService`, yol VARSAYIM) hizmet
  ayri isaretlerle kapali; birinin acilmasi digerini acmaz. Acmak kod degisikligi ve kullanici onayi ister; acan cekme isteginde gercek kopruyle
  yapilan denemenin sonucu (hangi yol, ornek cevap bicimi; adres ve kimlik bilgisi olmadan) belgeye girer, deneme yoksa birlesmez.
- LH2 b: cekirdek istegi simdi acildi (ayar bir kez dolduktan sonra bosaltilabilsin). Birlesince iki ayar (malzeme ve hizmet KDV orani) icin
  "doldur, bosalt, KDV gitmez" testi eklenir. Bu plan onu beklemez.
- Giden kutusu gocu birlesmeden once ayni dosyada duzeltilir; birlestikten sonra yeni goc yazilir.
