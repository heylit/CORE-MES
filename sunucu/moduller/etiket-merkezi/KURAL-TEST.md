# KURAL-TEST: etiket-merkezi

| Kural | Test |
|---|---|
| EM-1 öğe etiketin dışına taşmaz, yazı kutusundan büyük olmaz | `EM-1: hazır şablonların hepsi etiketin içinde kalır` (kurallar.test.ts) |
| EM-2 mm -> nokta yuvarlama | `EM-2: milimetre yazıcı noktasına yuvarlanır` |
| EM-3 Türkçe harf sadeleştirme, QR'a dokunmaz | `EM-3: sadeleştirme yalnız Türkçe harfleri çevirir` |
| EM-4 değeri olmayan alan basılmaz | `EM-4: değeri olmayan alan basılmaz` |
| EM-5 ZPL kaçışı, metin komut açamaz | `EM-5: ZPL alanında ^, ~ ve _ kaçırılır` |
| EM-6 PPLB kaçışı, satır sonu atılır | `EM-6: PPLB metninde tırnak ve ters bölü kaçırılır` |
| EM-7 QR içeriği kod sözlüğüne uyar | `EM-7: örnek QR içerikleri kod sözlüğünde` |
| EM-8 ağ yazıcısı tek IP ve aralık içi; aralık yalnız kurum içi | `EM-8` (iki test, kurallar.test.ts), `EM-U6` |
| EM-9 doğrudan baskı ayar ve aralıkla açılır | `EM-9 ve EM-10` (kurallar.test.ts), `EM-U7` |
| EM-10 pasif, dosya, aralık dışı yazıcı ve deneme dışı şablon basılmaz | `EM-9 ve EM-10`, `EM-U7` |
| EM-11 örnek değer yalnız deneme şablonunda; kayıt yalnız kendi türündeki şablonla | `EM-11` (kurallar.test.ts), `EM-U9`, `EM-U10` |
| EM-12 bir baskıda kayıt x adet en çok 500 | `EM-12`, `EM-U9` |
| EM-13 konum etiketi stok kodu ve LOC önekli QR; 20 karakterlik kod kesilmez | `EM-13`, `EM-U9`, `EM-U10` |
| EM-14 komut dosyası yalnız kullanımdaki dosya yazıcısına, türü uyan şablonla iner | `EM-14` (kurallar.test.ts), `EM-U11` |
| EM-15 lot etiketi stokun lot satırlarını basar; boş alan basılmaz, miktar Türkçe, tarih tesis günü | `EM-15` (kurallar.test.ts), `EM-U12` |
| EM-16 istasyon etiketi istasyonun stok konum kodunu LOC önekiyle basar | `EM-16`, `EM-U12` |
| EM-18 malzeme etiketi kart no QR, ad, stok kodu basar | `EM-18`, `EM-U14` |
| EM-19 mal kabul seçimi lot şablonuyla basılır, deftere lot olarak yazılır; sınır basılan etiket sayısıyla | `EM-11` (kurallar.test.ts), `EM-U14` |
| EM-17 refakat kartı etiketi emrin refakat kartını basar; termin yoksa "yok", basım tesis günü, işlem sırası tek metin | `EM-17`, `EM-U13` |
| EM-20 refakat partisinin kartı (kart #127): emrin kartı, QR `RP:<parti>`, başlık emir no-P sıra, lot satırı (lot no, parti, döküm, sertifika); refakat şablonuyla basılır | `EM-17`, `EM-U16` |
| 2907 D4 (2887 a): refakat kartında revizyon kodu "Rev <kod>" kopya satırında ayrı kutuda (14 karaktere kadar tam), ekranlardaki kodun aynısı (belge-merkezi revKodu), basım anındaki değer; seçim 3B taslağına düşerse kartın revizyonu, o da yoksa boş (Kalite K1); kodsuz üründe ve rota harfiyle basılmaz; Kopya n/N ve karoyla çakışmaz | `EM-17`, `kurallar.test.ts` 2907 D4, `is-emri.test.ts` refakat kartı |
| EM-21 etiket listesi koddaki şablon ve kayıt türleriyle ayrışmaz: her şablon türü ve basılabilen her kayıt türü tam bir "Basılıyor" satırında; yapılacak türün şablonu yok (kart #1292) | `EM-U17` |
| Ekran: etiket listesi sahip modülü menü adıyla, durum ve başka yerdeki baskı yeriyle gösterir | `EtiketMerkezi.test.tsx` |
| Okuma yalnız sayfayı görene | `EM-U1` (etiket-merkezi.test.ts, gerçek PostgreSQL) |
| Çıktı dil, dpi, adet; adet 1-500 | `EM-U2`, `EM-U4` |
| Ekran: seçimler isteğe gider, sınır dışı adet indirmeyi kapatır | `EtiketMerkezi.test.tsx` |
| Yazıcı tanımı yetkisi, sürüm, ad tekil | `EM-U5` |
| Baskı defteri yalnız eklenir, gönderilemeyen baskı "hata" ile yazılır | `EM-U8` |
| Ekran: yalnız ağ yazıcısına gönderim, tekrar kimliği, kapalıysa neden, yetkiye göre düğmeler | `EtiketMerkezi.test.tsx` |
| Kayıttan çıktı istenen sırada, bulunamayan eksiklerde; basılan konum baskıya bağlı ve değişmez | `EM-U9`, `EM-U10` |
| Dosya yazıcısı indirmesi yazıcının diliyle, "indirildi" sonucuyla deftere; tekrar korumalı; `bas` ister | `EM-U11` |
| Lot ve istasyon kayıttan çıktı; konumsuz istasyon eksikte; basılan lot deftere bağlı | `EM-U12` |
| Malzeme karttan; mal kabul bütün lotlarından, deftere lot olarak; lot etiketinde tür adı | `EM-U14` |
| Refakat kartı emirden çıktı; olmayan emir eksikte, iptal emir 409; basılan deftere bağlı | `EM-U13` |
| Refakat partisi kartı stoktan çıktı; iptal ve olmayan kart eksikte; deftere emrin refakat kartı yazılır | `EM-U16` |
| EM-20: raf etiketi RAF önekiyle; kodla aynı ad ve bilinmeyen ölçü basılmaz (#116) | `kurallar.test.ts` EM-20 |
| Raf Fabrika Haritası'ndan; bölüm ve bölme/kat gözlerden; pasif ve olmayan raf eksikte; deftere raf; seçim ucu ve kayıt çıktısı `oku` ister | `EM-U15` |
| Ekran: konum ve raf seçimi toplu ve tek tek, adrese yazılır; konum listesi stok okuması ister; okuması olmayan kartı görmez | `EtiketMerkezi.test.tsx` (#116) |
| Ekran: stok adresi seçili konumlarla açılır, çıkarma adresi günceller, bozuk adres örneğe döner | `EtiketMerkezi.test.tsx`, `kayit-secimi.test.ts` |
| EM-21: hatalı parça etiketi kayıttan; durum karardan (yoksa "Karar bekliyor"); QR parçanın emri (`UE:`) | `kurallar.test.ts` EM-7, `EM-U18` |
| Hatalı parça kaydı Üretim Emirleri'nden; olmayan eksikte; lot şablonu basmaz; deftere `hatali-parca` olarak kayıt kimliği; `oku` olmayan 403 | `EM-U18` |
| EM-22: kalite durum etiketi bakiye satırından; durum satırdan, stok hal adlarıyla; QR lot (`LOT:`) | `kurallar.test.ts` EM-7, `EM-U19` |
| Kalite durumu stoktan (`disari.ts kaliteEtiketleri`); olmayan, lotsuz, boş satır eksikte; lot şablonu basmaz; deftere `kalite-durum` olarak bakiye satırı; `oku` olmayan 403 | `EM-U19` |
| EM-23: sevk koli etiketi Sevkiyat kaleminden; koli başına bir etiket (n/N); koli içi adet elle, yoksa kalemin adedi; QR kalemin emri (`UE:`), emirsizde yok | `kurallar.test.ts` EM-7, `EM-U20`, `EtiketMerkezi.test.tsx` |
| EM-24: koli sayısı yalnız sevk kolisinde (başka türde 400); kayıt x koli x adet sınırı; deftere kalem bir kez | `EM-U20` |
| EM-25: piktogram yazıcıda kutu komutuyla basılır (ZPL `^GB`, PPLB `LO`; bit eşlem yok); ters yazı ZPL `^FR`, PPLB `R`; önizleme aynı biçimleri çizer | `kurallar.test.ts` EM-25, `piktogram.test.ts`, `etiket-piktogramlari.test.ts`, `EtiketMerkezi.test.tsx` |
| EM-26: koşullu öğe (`kosul`) alanı boşsa basılmaz; tanınmayan piktogram değeri basılmaz | `kurallar.test.ts` EM-26 |
| EM-27 (2907, 2907-1 a): refakat kartında 10 işlem satırı (no, ad, yer, işaret; satır aralığı 7 mm); adım başına imza ve elle kayıt kutusu yok (2932); adet kutusu "EMİR ADEDİ"; fazlası son satırda "+N işlem daha"; boş satır kaldıysa çıkış satırı; işaret yalnız fasonda ve çıkışta; lot no siyah bantta, "Parti" yalnız tedarikçi partisi, bölünmüş emir satırı yalnız alt partide | `kurallar.test.ts` EM-17, EM-27, `EM-U16` |
| EM-28: kalite ve hatalı parça kararı karoyla (bekliyor çizgili, kabul beyaz, şartlı/rework/hurda/red siyah); redde kalın çerçeve; sevk kolisinde koli içi girilmeden çok kolide başlık "KALEM TOPLAMI" | `kurallar.test.ts` EM-28, `EM-U18`, `EM-U20` |
| Her şablonun sağ üstünde türün piktogramı; etiket listesinde her türün piktogramı | `kurallar.test.ts`, `EtiketMerkezi.test.tsx` |
| EM-30 (2223-1 a): bekleyen etiketler kaynak kayıttan türetilir (tablo yok); 30 gün geriye; mal kabulde kabulden sonra basılmamış lotlar, kalite durumunda durumu değiştiren yer içi hareketten sonra basılmamış bakiye satırı; kabul girişi kalite bekleyeni açmaz (897 b); `oku` ister | `kurallar.test.ts` EM-30, `EM-U21` |
| EM-31 (2223-4 a): basılmayacak işareti (`etiket_merkezi_atlanan`, yalnız ekleme, kişi ve zamanla) olaydan sonra verildiyse kayıt Basılacaklar'dan düşer; olay işaretten sonraysa yeniden bekler; `bas` ister | `kurallar.test.ts` EM-31, `EM-U22` |
| EM-32 (2223-2 a): depodan emre verilen lotun refakat kartı (açık, birleşmemiş, lotlu refakat partisi; olay lota bağlanma ya da açılış) emrin kartı o andan sonra basılmadıysa bekler; başlık emir no-P sıra | `kurallar.test.ts` EM-32, `EM-U23` |
| EM-33 (2223-2 a): hatalı parça ayrılınca ve rework, hurda ya da red kararıyla bekler; kabul ve şartlı kabul beklemez; olay karar anı yoksa ayrılma anı; Üretim Emirleri'nin son kayıt listesinden süzülür | `kurallar.test.ts` EM-33, `EM-U23` |
| EM-34 (2885, 2885-1 a): QR'ın taşıdığı kod bütün etiketlerde QR'ın altına okunur yazı olarak basılır (elle giriş için); altında boş yer varsa QR boyutu değişmez, yoksa QR kendi kutusunda yazı satırı kadar küçülür | `kurallar.test.ts` EM-34 |
| EM-35 (kart 2904): tarayıcıdan vektörel yazdırma yazıcı tanımı istemez; her etiketin öğeleri önizlemeyle aynı yerleşimden (sade değil) döner, deftere yazıcısız `yazdirildi` yazılır, kayıt bağları indirmedeki gibi; bekleyen `gonderildi` ile aynı kuralla düşer; defter kısıtı yazıcısız satırı yalnız bu sonuçta kabul eder | `EM-U24`, `EM-U25` |
| EM-36 (kart 2904): baskı sayfası şablonun mm ölçüsünde, kenar boşluksuz, her etiket adet kez ayrı sayfa; ekran ölçeği uygulanmaz; QR yol olarak (görüntü yok); gövde sınıfı ve @page stili yalnız yazdırma süresince | `EtiketMerkezi.test.tsx` (vektörel yazdırma) |
