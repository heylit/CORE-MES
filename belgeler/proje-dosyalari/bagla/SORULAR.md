# Bagla tur 1: acik sorular

Neden simdi: Asama 2 (BAGLA) basladi; once tedarik akisi C (talep, siparis, mal kabul, stok) baglanacak, bos duran moduller de kendi listelerini hazirladi.
Nasil cevaplanir: her soruya kod ve harf yeter. Ornek: "hepsi a, yaz" ya da "hepsi a, SA2 b, yaz".
Siz "yaz" demeden hicbir dal acilmaz, hicbir sey yazilmaz, hicbir goc calismaz.

## Ozet tablo

| Kod | Konu | Oneri | Veri degistirir mi |
|---|---|---|---|
| ST1 | Mal kabul satirini siparis satirina bagla | a | dolu tablo, once sayar |
| ST2 | Mal kabul ekraninda siparis secimi | a | hayir |
| ST3 | Stok ekranlarinda birim | a | hayir |
| ST4 | Toplamayi kim kapatabilir | a | hayir |
| ST5 | Stok okuma yetkisi | a | hayir |
| ST6 | Fason firma ve fason konumu | a | hayir |
| SA1 | Tedarikci -> finans firma karti | a | dolu tablo, once sayar |
| SA2 | Katalog kalemi -> malzeme karti | a | dolu tablo, once sayar |
| SA3 | Kur finanstan okunsun | a | dolu tablo, once sayar |
| SA4 | Onay dugmeleri gizlensin | a | hayir |
| SA5 | SAT-56 ile Karar 10 celiskisi | a | hayir |
| SA6 | Eski dallarin silinmesi | a | hayir |
| ML1 | Logo birim karsiligi -> birim listesi | a | dolu tablo, once sayar |
| ML2 | Birim listesini kim duzenler | a | hayir |
| AG1 | Arkon yansima dizini | a | hayir (yalniz dizin) |
| AG2 | Arkon tesis kodlari -> istasyon kimligi | a | dolu tablo, once sayar |
| RG1 | Rota operasyon tipi anahtari | a | dolu tablo, once sayar |
| UA1 | Istasyona "uretim alani" isareti | a | dolu tablo, once sayar |
| CK1 | Rol dagitimi sirasi | a | evet (rol satiri ekler, onayla) |
| CK2 | Surum sutunu | a | dolu tablo, once sayar |
| CK3 | btree_gist eklentisi | a | hayir |
| KN1 | Kart numarasi olmayan isler | a | hayir |

"Dolu tablo, once sayar": goc once etkilenecek satirlari sayar; etkilenen satir varsa hicbir sey degistirmeden durur ve sayiyi size bildirir.

---

# Tedarik (akis C)

## Finans (soru yok)

- Finans bu turda yalniz iki okuma fonksiyonu ekler: `firmaOzetleri` (bircok firmanin ozeti tek seferde) ve `kurGetir` / `kurlar` (bir para biriminin bir tarihteki ya da ondan onceki son kuru; yoksa bos).
- Goc yok, veri degismez. Kart #246.
- Satin alma bu fonksiyonlari bekliyor: tedarikci listesinde sehir ve iletisim icin ve SA3 a icin.
- Bilgi: satin alma dosyasina gore finansta sehir alani yok; o gelene kadar sehir bos gorunur.

## Stok (kart #206)

Not: stok dosyasi S1-S6'nin yalniz basligini veriyor ("metinleri thread cevabinda"). Secenek metinleri kaynakta yazmiyor.
Asagidaki a ve b, stok listesindeki islere (Y1-Y9) gore yazildi: a = listedeki is bu turda yapilir, b = yapilmaz.

### ST1. Mal kabul satirini siparis satirina baglama (goc)
- Ne soruluyor: depocu mal kabul ederken satir hangi siparis satirina ait, veritabaninda tutulsun mu.
- Neden simdi: SH1 a ile mal kabul, satin almaya "teslim alindi" bilgisini yazacak. Bunun icin satirin siparis satirini bilmesi gerekir (C7, stok borc 18).
- a) Mal kabul satirina bos olabilen yeni bir sutun ve siparis satirina anahtar eklenir. Var olan satirlar degismez, yalniz yeni sutun bos kalir. Geri alma: sutunu kaldiran yeni goc.
- b) Bu turda degil. Mal kabul siparise baglanamaz; talep "teslim alindi"ya gecmez (bugunku hal).
- Oneri ve gerekce: a. Teslim bilgisinin bos kalmasi bugun kullanimi etkiliyor; goc var olan satiri degistirmiyor.

### ST2. Mal kabul ekraninda siparise bagli kabul
- Ne soruluyor: depocu mal kabulde tur "satin alma" secince acik siparis satirlarini (tedarikci, malzeme, kalan miktar) gorsun mu; satir secince malzeme ve miktar kendiliginden dolsun mu.
- Neden simdi: ST1 ile ayni is (C6, borc 18); satin almanin teslim fonksiyonuna baglidir.
- a) Ekran boyle olur. Veri degismez. Geri alma: ekran degisikligi.
- b) Ekran bugunku gibi kalir; depocu malzeme ve miktari elle girer.
- Oneri ve gerekce: a. Elle giriste siparis bagi kurulamaz, ST1 islevsiz kalir.

### ST3. Stok ekranlarinda birim gosterimi
- Ne soruluyor: Malzemeler listesi, ayrinti ve mal kabul ekraninda miktarin yaninda birim (adet, kg vb.) gorunsun mu.
- Neden simdi: birim malzeme ozetinde zaten var (stok borc 4, 21; C13). Ekran onayi gerekiyor.
- a) Birim bu uc yerde gorunur. Veri degismez.
- b) Birim gosterilmez (bugunku hal).
- Oneri ve gerekce: a. Bilgi hazir, yalniz ekran isi.

### ST4. Toplamayi kapatma kisi denetimi
- Ne soruluyor: bir toplamayi yalniz belirli kisi mi kapatabilsin. Bugun toplamayi baska bir kisi de kapatabiliyor.
- Neden simdi: "kullanima acmadan once" kapanmasi gereken isler arasinda (C15, stok borc 15).
- a) Denetim bu turda eklenir (Y8). Kimin kapatabilecegi kuralinin ayrintisi kaynakta yazmiyor. Rol gerekirse ayrica onay istenir.
- b) Bu turda eklenmez, borcta kalir.
- Oneri ve gerekce: a. Kullanima acmadan once kapanmasi gereken madde.

### ST5. Stok okuma uclari yetkisi
- Ne soruluyor: stok verisini kimler okuyabilsin. Bugun stokun 26 okuma ucu "oturum" ile acik: oturumu olan her rol stok verisini okur.
- Neden simdi: C15, stok borc 13 (K3 karari bekliyor).
- a) Okuma uclari role baglanir (Y9). Hangi role ne verilecegi kaynakta yazmiyor; yeni rol satiri gerekirse ayrica onay istenir.
- b) Bugunku gibi oturumu olan herkes okur.
- Oneri ve gerekce: a. Rol bazli gizleme olmadan kullanima acmak ortak kurala (ADR 0007) uymuyor.

### ST6. Fason firma ve fason konumu
- Ne soruluyor: stokta fason firma ve fason konumu bu turda acilsin mi.
- Neden simdi: stok listesi satin alma kabulunde tedarikciyi siparisten okuyor, stokta firma sutunu gerekmiyor (VARSAYIM). Fason icin karar gerekiyor.
- a) Fason firma ve fason konumu bu turda kapali kalir. Veri degismez. Geri alma: sonra yeni sutun gocu.
- b) Bu turda acilir. Ne gerektirdigi kaynakta yazmiyor (HAZIRLIK C12 yeni sutun diyor).
- Oneri ve gerekce: a. Tedarik akisi fason olmadan calisiyor; is buyumez.

Not (soru degil): stok ve satin alma listeleri teslim konusunda iki noktada farkli yaziyor: sutun adi ve kalan miktari asan teslim (stok "409 ile reddedilir", satin alma "asabilir, tamam gorunur" diyor). Yazimdan once tek kurala inmeli.

## Satin alma (kart #162)

### SA1. Tedarikciyi finans firma kartina baglama (goc)
- Ne soruluyor: satin almadaki tedarikci kaydi, finanstaki firma kartina veritabaninda anahtarla baglansin mi.
- Neden simdi: bugun tedarikci eklenemiyor, satin alma gecici bir firma dosyasi kullaniyor (C1). Bu dosya silinip finans kullanilacak; anahtar bu bagin guvencesi (C2).
- a) Anahtar eklenir. Goc once karsiligi olmayan tedarikci satirlarini sayar; varsa sayiyi yazar ve durur. Geri alma: anahtari kaldiran yeni goc, veri kaybi yok.
- b) Bu turda degil. Firma numarasi anahtarsiz bir sayi olarak kalir.
- Oneri ve gerekce: a. Firma sahibi finans; anahtar olmadan silinmis firmaya bagli tedarikci kalabilir.

### SA2. Katalog kalemini malzeme kartina baglama
- Ne soruluyor: satinalmacinin katalogundaki kalem (kod, ad, kategori, birim) malzeme kartina nasil baglansin. Bugun talep eden yeni kalemi katalogda kendisi aciyor (SAT-58).
- Neden simdi: sahiplik karari (OS6) "katalog malzeme kartina bagli" dedi (C8, satin alma borc 5).
- a) Bag istege bagli. Bagli kalemde ad, birim ve kategori malzeme kartindan okunur; bagsiz kalemde kopyalar kalir. Talep eden eskisi gibi yeni kalem acabilir. Malzeme numarasina anahtar eklenir (dolu tablo, once sayar); hicbir sutun dusmez. Geri alma ucuz.
- b) Bag zorunlu. Kopya sutunlar (kod, ad, kategori, birim) duser; yeni kalem yalniz malzemelerde acilir (SAT-58 degisir). Dusen sutunlardaki veri gider; geri alma pahali.
- c) Bu turda degismez.
- Oneri ve gerekce: a (satin alma thread'inin onerisi): gunluk is bozulmaz, veri kaybi yok.
- Dikkat: sahiplik karari (OS6) "ad, birim, kategori malzemeden okunur; kopya sutunlar kalkar" diyor. Bu karara harfiyen uyan secenek b; a ise thread'in onerisi.
- Not: kaynak dosyada harfler ters (orada a zorunlu, b istege bagli). Burada a = istege bagli.

### SA3. Kur finanstan okunsun
- Ne soruluyor: satinalmacinin teklif ve sipariste kullandigi kur nereden gelsin.
- Neden simdi: finans gunluk kuru tarihle tutuyor, satin alma tek bir guncel kur tutuyor (C9). Para ve kur sahibi finans (OS5).
- a) Kur finanstan okunur; satin almanin kendi kur sutunu duser. Para birimi listesi ve aylik faiz satin almada kalir. Dusen sutundaki kur degerleri gider. Finansin `kurGetir` fonksiyonunu ister.
- b) Satin alma kendi kurunu tutar; finansin kuru yalniz oneri olarak gosterilir. Veri degismez; iki yerde kur yasar.
- Oneri ve gerekce: a. Sahiplik kararina uyar, tek kur kaynagi olur.

### SA4. Onay ve siparis dugmeleri durumla gizlensin
- Ne soruluyor: talep onaya ya da siparise uygun degilken o dugmeler gorunmesin mi. Bugun gorunuyor, tiklayinca 422 hatasi donuyor (C16, borc 29).
- Neden simdi: kullanici bugun hata goruyor.
- a) Dugmeler duruma gore gizlenir. Veri degismez.
- b) Kalsin.
- Oneri ve gerekce: a. Kullanici calismayan dugmeye basmaz.

### SA5. SAT-56 ile Karar 10 celiskisi
- Ne soruluyor: ekranin gonderdigi toplam, sunucunun hesapladigindan farkliysa ne olsun. SAT-56 "reddedilir" diyor; onayli Karar 10 "turetilmis deger sunucuda hesaplanir" diyor.
- Neden simdi: iki kural birbirini tutmuyor (borc 30).
- a) Karar 10 gecerli: sunucu ekranin degerini yok sayar, kendi hesabini yazar; SAT-56 metni buna gore duzeltilir.
- b) Farkli deger reddedilir; kullanici hata gorur.
- Oneri ve gerekce: a. Onayli karara uyar, kullanici bosuna hata gormez.

### SA6. Eski dallarin silinmesi
- Ne soruluyor: satin almanin uzak depodaki eski dallari silinsin mi.
- Neden simdi: acik dal siniri 5 ve bes dal duruyor. `-3`, `-4`, `-5` dallarinin cekme istekleri birlesti (#305, #319, #336).
- a) Birlesmis bu uc dal silinir. `-2` ve `-uyum` silinmeden once ayrica denetlenir. Kod ve veri kaybi yok; birlesen is ana dalda.
- b) Kalsin. Yeni dalin sinira takilip takilmayacagi kaynakta acikca yazmiyor.
- Oneri ve gerekce: a. Yeni dal (`162-satin-alma-bagla`) icin yer acar.

## Malzemeler (kart #163)

Bu turda malzemeler ayrica (soru olmadan) malzeme arama, toplu ozet ve yeni bir olcu birimi listesi yazar. Yeni ya da birimi degisen kartta listede olmayan birim reddedilir; eski kartlar oldugu gibi okunur.

### ML1. Logo birim karsiligini birim listesine baglama (goc)
- Ne soruluyor: Logo birim karsiligi tablosu (dolu olabilir), yeni birim listesine veritabaninda anahtarla baglansin mi.
- Neden simdi: SH4 a "Logo karsiligi bu listeye baglanir" dedi; anahtar dolu tabloya kisit getirir.
- a) Evet. Goc once listede olmayan karsilik satirlarini sayar; varsa hicbir sey degistirmeden sayi ve satirlarla durur. Geri alma: anahtari kaldiran goc, veri kaybi yok.
- b) Hayir. Bag yalniz ekranda kurulur (karsiliklar listeden gosterilir); veritabaninda anahtar yok.
- Oneri ve gerekce: a. Listede olmayan birime karsilik yazilamaz.

### ML2. Birim listesini kim, nerede duzenler
- Ne soruluyor: olcu birimleri listesine yeni birim ekleme ya da duzeltme nereden yapilsin.
- Neden simdi: liste bugun prototipin Ayarlar ekraninda ve tarayicida; sunucu tablosuna gecince tek yer olmali.
- a) Malzemeler ikinci menusunde yeni "Birimler" sayfasi; tanim yazma yetkisi olan duzenler. Prototipteki listeye yapilan degisiklik sunucuya yazilmaz; prototip ekrani degismez (VARSAYIM: kopru bunu ayirt edebilir; edemezse yeniden sorulur).
- b) Prototipin var olan Ayarlar listesi kalir; kopru kaydi sunucu tablosuna yazar.
- Oneri ve gerekce: a. Tek duzenleme yeri olur, yetki sunucuda denetlenir.

---

# Uretim ve ortak (uretim emri modelini beklemeyen isler)

## Arkon (kart #199)

### AG1. Arkon yansima tablosuna kismi dizin (AA4)
- Ne soruluyor: Arkon'un TMI'ye henuz yazilmamis yansima kayitlarini bulmasi icin veritabanina dizin eklensin mi.
- Neden simdi: Arkon kucuk borclari (A11); uretim emri modeline dokunmaz.
- a) Dizin eklenir. Veri degismez, ekran degismez. Geri alma: dizini kaldiran goc, ucuz.
- b) Eklenmez.
- Oneri ve gerekce: a. Veriye dokunmayan kucuk bir is.

### AG2. Arkon tesis kodlari metinden istasyon kimligine (AA7)
- Ne soruluyor: Arkon'daki is merkezi, istasyon ve makine kodlari bugun metin. Bunlar istasyonlar modulundeki kayitlarin kimligine cevrilsin mi.
- Neden simdi: sahibi istasyonlar (A8); gereken okuma fonksiyonlari hazir; uretim emri modelini beklemez.
- a) Donusum gocu yazilir. Dolu iki yer degisir (tesis ayari ve kayitlardaki makine). Kaynakta sayma adimi yazmiyor; kural geregi goc once sayar, etkilenecek satir varsa durur ve size bildirir. Geri alma maliyeti kaynakta yazmiyor.
- b) Bu turda degil. Arkon kendi metin kodlariyla kalir (bugunku hal).
- Oneri ve gerekce: a. Tesis bilgisi tek yerden (istasyonlar) gelir.

## Rota (kart #260)

### RG1. Rota adiminin operasyon tipine anahtar (R1)
- Ne soruluyor: rota adimindaki operasyon tipi, istasyonlarin operasyon tipi listesine anahtarla baglansin mi.
- Neden simdi: bugun rota gecici bir esleme kullaniyor; Operasyonlar bolumu katalogu yanlis okuyor ve kayit 400 hatasi veriyor (A2, A4). Esleme kalkinca rota kisaltma, varsayilan sureler ve varsayilan istasyonu dogrudan katalogdan okur.
- a) Anahtar eklenir; goc once var olan rota adimlarini dogrular, karsiligi olmayan varsa durur. Geri alma: anahtari kaldiran goc, veri kaybi yok.
- b) Bu turda degil. Operasyon tipi anahtarsiz bir sayi olarak kalir.
- Oneri ve gerekce: a. Operasyon tipinin sahibi istasyonlar (RT2 a); anahtar silinmis tipe bagli adimi engeller.

## Istasyonlar (kart yok, bkz. KN1)

### UA1. Istasyona "uretim alani" isareti (goc)
- Ne soruluyor: SH5 b kararinin gocu yazilsin mi. Istasyon penceresine "Uretim alani" isaret kutusu gelir; stok yalniz isaretli istasyonda uretim alani konumu acabilir.
- Neden simdi: stokun uretim alani konumu (stok borc 17) bu isareti bekliyor.
- a) Istasyon tablosuna yeni sutun eklenir. Goc satirlari sayip bildirir; hepsi isaretsiz baslar, satir silinmez, baska deger degismez. Geri alma: sutunu dusuren goc; verilen isaretler kaybolur.
- b) Bu turda degil. Stokta uretim alani konumu acilamaz.
- Oneri ve gerekce: a. Kararin (SH5 b) geregi; var olan degerler degismez.

## Ortak arayuz (soru yok)

Ortak arayuz bu turda dort is yapar (kart "yeni", KN1'e bagli):
1. O1: ikinci menu maddesi "su islemlerden biri yeter" bilgisini tasir. Bugun Arkon rolu verilen operator menude tiklayinca ilk sayfaya geri donebilir.
2. O2: ortak kisi secici. Bugun istasyon yetkisi olup kisi okuma yetkisi olmayan rol hata goruyor.
3. O3: menunun cihaza gore sade gorunumu (depocu modu) ve cihaz tercihleri icin ortak yer.
4. O4: yalniz belge: kapanmis iki madde (tablette sol menu, 1280 piksel kuculme) dosyalardan duser.

## Cekirdek (kart yok, bkz. KN1)

### CK1. Rol dagitimi sirasi
- Ne soruluyor: bugun bircok modulde (plan, rota, finans, satin alma, stok, kalibrasyon, durus nedenleri) islemler yalniz yoneticide; yonetici disinda kimse bu ekranlari acamaz ya da yazamaz. Roller hangi sirayla dagitilsin.
- Neden simdi: kullanima acmadan once kapanmali (madde 1, 2, 19).
- a) Akis sirasiyla (C, A, B, D); her akisin rolleri o akisin kartinda, her satir sizin onayinizla.
- b) Tek turda hepsi.
- Veri: rol satirlari eklenir (gocle). Geri alma maliyeti kaynakta yazmiyor.
- Oneri ve gerekce: a. Her akis kullanima acilirken o akisin rolleri birlikte gelir.

### CK2. Surum sutunu (durus nedenleri, kalibrasyon)
- Ne soruluyor: ayni kaydi iki kisi ayni anda duzeltirse sonraki oncekini sessizce eziyor. Bunu engelleyen `surum` sutunu bu iki dolu tabloya eklensin mi.
- Neden simdi: kullanici kararla borca alinmisti (madde 5).
- a) Evet, varsayilan 1 ile. Var olan degerler degismez. Geri alma ucuz, veri kaybi yok.
- b) Hayir, borcta kalir; son yazan kazanir.
- Oneri ve gerekce: a. Sessiz veri ezilmesini durdurur.

### CK3. btree_gist eklentisi
- Ne soruluyor: plan ayni istasyona cakisan iki is yerlestirmesini veritabaninda engellesin diye eklenti kurulsun mu. Bugun cakisma yalniz uygulamada engelleniyor.
- Neden simdi: cekirdek borc listesinde (madde 27); yeni paket ve goc onayi ister.
- a) Plan akisina (B) kadar bekler. Bir sey degismez.
- b) Simdi kurulur: yeni eklenti ve goc.
- Oneri ve gerekce: a. Cakisma bugun uygulamada engelleniyor; plan akisi daha sonra.

---

# Kart numaralari

### KN1. Kart numarasi olmayan isler
- Ne soruluyor: istasyonlar (UA1), ortak arayuz (O1-O3) ve cekirdek gruplari icin kart numarasi yok. Bunlar nasil yazilsin.
- Neden simdi: her is kendi kart numarasini dal adinda tasir; numara olmadan dal acilamaz.
- a) Modulun var olan karti kullanilir; yeni kart gereken yer size bildirilir.
- b) Numaralari siz verirsiniz.
- Oneri ve gerekce: a. Is beklemez; yeni kart yalniz gerektiginde acilir.

---

# Yaz deyince ne olur

Dokuz parca yazmaya baslar; her parcanin tek yazari vardir:

| Parca | Kart | Dal |
|---|---|---|
| Finans | #246 | kaynakta yazmiyor |
| Stok | #206 | `206-bagla-tedarik` |
| Satin alma | #162 | `162-satin-alma-bagla` |
| Malzemeler | #163 | `163-malzemeler-oturtma-o7b51n` (son ana daldan yeniden) |
| Istasyonlar | yok (KN1) | `<kart>-istasyonlar-uretim-alani` |
| Arkon | #199 (AA6 icin #243) | `199-arkon-a11-kilit`, `199-arkon-a11-dizin`, `199-arkon-y8`, `199-arkon-a8`, `199-arkon-y4`, `243-arkon-y3` |
| Rota | #260 | `260-rota-bagla-a` |
| Cekirdek | yok (KN1); her grup ayri kart ve dal | kaynakta yazmiyor |
| Ortak arayuz | yeni (KN1) | `<kart>-menu-coklu-islem`, `<kart>-ortak-kisi-secici`, `<kart>-menu-sade-gorunum` |

- Cekirdek ve ortak arayuz once birlesir; diger parcalar onlarin uzerine kurulur.
- Olasi dolu bir tabloya dokunan her goc once satirlari sayar. Etkilenecek tek satir bile varsa hicbir sey degistirmeden durur ve sayiyi size bildirir.
- Rol satirlari ortak yetki matrisinden ve sizin onayinizla eklenir.
- Her akis, siz deneyip "tamam" deyince biter.
