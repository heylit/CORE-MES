# FARK: malzeme araması trigram indeksiyle; Ctrl K kaynağı çekirdeğin tek arama ucuna geçti (kart #1244; 1231 a, 1233 sözleşmesi)

- Göç `20261029133000_malzemeler_arama_trigram.sql`: `malzeme_katalog_karti` üzerinde stok kodu, ad, eski kod ve tedarikçi kodu ifadelerinin `public.arama_sade` sadeleşmesine dört GIN (`public.gin_trgm_ops`). Veri değişmez. Uzantı 1233 göçünde (`20261029125000`).
- Sorgu kalıbı `ILIKE` yerine sadeleşmiş `LIKE` (1233: C.UTF-8 Türkçe I/ı, İ/i eşlemiyordu); `malzemeAra` imzası aynı, eşleşme artık Türkçe harf duyarsız. ASCII ve Türkçe dışındaki büyük harf (ör. É) artık küçüğüyle eşleşmez. İndeks ifadeleri `sorgular.ts` ARAMA_KOSULU ile birebir aynıdır; `arama-indeksi.test.ts` 20.000 sentetik satırda liste ve sayım planında indeksi ister (ifade ayrışırsa kırılır; göç yokken iki test düştü, yerelde denendi).
- Ölçüm (yerel PG16, 20.000 sentetik satır, EXPLAIN ANALYZE): indeksli 1,3 ms, indekssiz 150 ms.
- Ctrl K: `disari.ts` `kayitAramaKaynaklari` (tür `malzeme`, yetki `sayfa.malzemeler`); başlık stok kodu, açıklama ad · tür · durum. Sıra tam kod, kart no, koddan başlayan, yeniden eskiye. `paylasilan/sayfalar/malzemeler.ts` `aramaUcu` ve `GET /malzemeler/ara` kalktı.
- `malzemeAra` (seçiciler, stok, rota, recete-rota) imzası ve sırası değişmedi.

# FARK: mükerrer kart gerekçesi en az 10 karakter (kullanıcı kararı 2026-10-16 07:24)

- Sunucu (`kurallar.ts` `mukerrerGerekcesiKisaMi`, `servis.ts`): gerekçe boşluksuz 10 karakterden kısaysa 400 `DOGRULAMA`, alan `ozet.mukerrer_gerekcesi`. Kayıtlı gerekçe değişmedikçe sorulmaz. Göç yok (veritabanı kısıtı "boş değil" olarak kaldı).
- Köprü ve ekran: bu ret `gerekce-kisa` koduyla gider; ekran genel "kayıt yapılamadı" yerine sunucunun iletisini gösterir. Yeni görünüm yok.
- Testler: `katalog-kartlari.test.ts` "Gerekçe:" (kayıtlı gerekçe istisnası kaldırılınca kırılır), `katalog-onay-baglama.test.ts` MKK-10 çevrildi (önce tek harf geçiyordu), `katalog-kurallari.test.tsx` "mükerrer gerekçesi".

# FARK: Excel içe/dışa aktarma depodaki ExcelJS ile; katalogda CDN yüklemesi yok (yazılı onay kullanıcı, 2026-10-16 06:37 UTC)

- Paket: `exceljs` 4.4.0 (sabit sürüm, MIT lisansı), geliştirme bağımlılığı; derlemede istemci paketine kaynak metin olarak girer.
- Köprü (`MalzemeKatalogu.tsx`): çerçeve `kitaplik-excel` isteyince kitaplığın kaynağını yalnız o an yükleyip yanıtlar.
- Ekran (`katalog.html`): ExcelJS köprüden alınır; TMI dışında açılan prototipte "Excel kitaplığı yalnız TMI içinde var.". İçe aktarma SheetJS yerine ExcelJS ile okur (satır biçimi aynı: boş hücre null, boş satır atlanır). SheetJS ve jsQR'ın CDN yedeği kaldırıldı; dosyada dış adres kalmadı. Önce çerçevenin CSP'si CDN betiklerini engellediğinden Excel çerçeve içinde çalışmıyordu.
- Testler: `MalzemeKatalogu.test.tsx` "Excel kitaplığı depodan": dışa aktarılan kitap aynı ekranla geri okunur, dış betik etiketi yok; TMI dışında ret iletisi.

# FARK: listede olmayan kategori kart kaydında reddedilir ve ekran kategori açmaya yönlendirir (malzeme denetimi 1/5 "Reddedilsin")

- Sunucu (`kurallar.ts` `denetlenecekKategoriler`, `sorgular.ts` `kategoriAcikMi`, `servis.ts`): sarf, demirbaş ve hizmet kartında `g.kat` `malzeme_kategorisi` listesinde (tür ve kod) açık değilse 400 `DOGRULAMA`, alan `kayit.g.kat`. Bekleyen talebin önerdiği kategori de denetlenir.
- Mevcut kartlara dokunulmaz: kayıtlı kartın aynı türdeki kategorisi değişmedikçe sorulmaz (kategorisi sonradan kapanan kart yeniden kaydedilir). Göç yok.
- Ekran (`katalog.html`): ret gelince adımın üstünde ileti ve "Kategorileri aç" düğmesi; düğme Malzeme ayarlarının sarf ya da demirbaş kategorileri bölümünü açar, orada "Karta dön" aynı karta döner, girilen bilgiler durur. Ayar yazma yetkisi (malzemeler.tanim-yaz) yoksa düğme yerine "Kategori açmak için yetkili kişiye başvurun." Hizmet gruplarının ayar bölümü olmadığından hizmette yalnız ileti. Yeni yetki yok.
- Köprü (`MalzemeKatalogu.tsx`): bu ret `kategori-yok` koduyla çerçeveye gider.
- Testler: `katalog-kartlari.test.ts` "Kategori:" (denetim kapatılınca ve kayıtlı kart istisnası kaldırılınca kırılır), `katalog-kurallari.test.tsx` "listede olmayan kategori". `bagla-tedarik.test.ts` listede olmayan kategorili eski kartı elle kurar.

# FARK: şablon ve ayar sürümle yazılır (malzeme denetimi 5/5 "Korunsun"; yazılı onay kullanıcı, 2026-10-16 04:38 UTC)

- Göç `20261016062845_malzemeler_sablon_ayar_surum.sql`: `malzeme_katalog_sablonu` ve `malzeme_katalog_ayari` tablolarına `surum integer NOT NULL DEFAULT 1`; var olan satırlar 1 ile başlar, veri değişmez.
- Sunucu (`sorgular.ts`, `servis.ts`): kaydet uçları gövdede `surum` alır (yeni kayıt null). Okunan sürüm kayıtlıyla aynıysa yazar ve sürümü artırır; değilse 409 `CAKISMA`, ileti çekirdeğin tek eski sürüm iletisi ("Sayfayı yenileyip değişikliğinizi yeniden yapın."). Sürümsüz istek kayıtlı satırın üstüne yazamaz. Kaldırılmış şablonun kimliğine sürümsüz yazılır (listede görünmez). Şablon kaldırma da sürümü artırır.
- Sözleşme: liste ve ayar cevapları `surumler` taşır; kaydet cevabı `{ id, surum }`.
- Köprü (`kopru.ts`): son okunan sürümü tutar, kayıtta gönderir, cevaptaki sürümle günceller. Aynı ayarın art arda giden kayıtları sırayla gider (aynı sekme kendini eski sürüm saymaz).
- Ekran: 409 iletisi şablonda da gösterilir (önce genel "tekrar dene" yazıyordu; kart kaydının 409 iletisi de artık görünür). Ayar ekranları iletiyi zaten gösteriyordu.
- Testler: `sablon-ve-okuma-yetkisi.test.ts` iki "Sürüm:" testi (koşul kaldırılınca ikisi de kırılır), `kopru.test.ts`. Öteki testler ekran gibi son sürümle yazar (`test-surum.ts`); `kisiler/rol-dagilimi.test.ts` ayarı okunan sürümle yazar.

# FARK: onaya gönderme ve aktif yapma anında birim ve zorunlu alan denetimi (malzeme denetimi 2/5 "İstesin", 3/5 "Ekranda", 4/5 "Denetlensin")

- Sunucu (`kurallar.ts` `katalogOnayEksigi`, `servis.ts`): onaya gönderilen ya da aktif yapılan kartın birimi boşsa ya da `malzeme` ayarında `kurallar[tür].zorunlu` true olan alan `kayit.g`'de boşsa 400 (`DOGRULAMA`). Taslak eksikle kaydolur; aktif kartın düzenlenmesi ve değişiklik talebi denetlenmez.
- Ekranın bu kartta göstermediği zorunlu alan (başka kategorinin alanı ya da koşulu tutmayan alan) sayılmaz: ekran bunları `ozet.uygulanmayan_zorunlu` ile bildirir (sözleşme `katalogKartiOzeti`, köprü geçirir). VARSAYIM: alanların koşulları yalnız ekranda tanımlı; sunucu bu listeye güvenir.
- Ekran: birimi boş kayıtlı kart açılınca birim varsayılanla doldurulmaz; seçim kutusu "Birim seçin" gösterir, birim seçilmeden kayıt yapılmaz. Göç yok.
- Testler: `katalog-kartlari.test.ts` "Birim:" ve "Zorunlu alan:" (kural kapatılınca her biri kırılır), `katalog-kurallari.test.tsx` "onay öncesi denetimler", `kopru.test.ts`. Öteki testlerin örnek kartlarına birim eklendi; `logo-hazirlik.test.ts` MKL-4 birimsiz kartın artık aktif olamadığını sınar.

# FARK: kayıtlı kartın kodu ekranda kayıtlı hâliyle görünür (borç 331, kullanıcı kararı "Kayıtlı kod")

- Hata: sunucuya bağlıyken kayıtlı taslakta çeşit (önek) değişince ekran yeni önekli kodu gösteriyordu; sunucu kodu yalnız tür değişince yeniler, kayıtlı kodu tutuyordu.
- Ekran (`katalog.html`): `finalKod` kayıtlı kartta kayıtlı kodu döndürür (`kayitliKod`); çeşit, grup, sınıf ya da kategori değişse de kod değişmez. Yalnız malzeme türü (hammadde, yarı mamul, mamul, sarf, demirbaş, hizmet) değişince sunucu yeni kod verir, ekran da öneki türe göre kurar; yeni kartta ve sunucusuz kullanımda kod bugünkü gibi önekten kurulur; elle yazılmış kod önce gelir.
- Test: `katalog-kurallari.test.tsx` "kayıtlı kart kodu" (düzeltmeden önce kırmızı). Sunucu, şema, işlem ve rol değişmedi.

# FARK: katalog prototipinin kuralları testle sabitlendi (borç 323, 330, 339, 344)

- `istemci/src/moduller/malzemeler/katalog-kurallari.test.tsx`: hizmet çeşitleri (grup ve çeşit kodları, kod ve ad kurma, çeşit değişiminde silinen alanlar, mükerrer anahtarı), tedarikçi alanı (sunucusuz serbest metin, sunucuyla arama ve seçim), kalıp motoru (`kalipUygula`, zorunlu alan, çakışma ayarı). 15 test bugünkü davranışı sabitler.
- Bilinen hata, sabitlenmedi (`it.skip`): karşılaştırma `tr` küçültmesiyle "I" ile "i"yi farklı sayar; aynı standart farklı harf boyuyla yazılınca mükerrer yakalanmaz.
- `katalog.html`, sunucu, şema, işlem ve rol değişmedi.

# FARK: katalogda QR çözücü depodan gelir, dış adrese gidilmez (borç 283, kısmen)

- `MalzemeKatalogu.tsx` çerçevenin sayfasına depodaki `jsqr` 1.4.0'ı (`node_modules/jsqr/dist/jsQR.js`, prototipin CDN'den istediği sürüm) gömer; prototip `window.jsQR` varken yükleyiciye gitmez. Fotoğraftan QR okuma BarcodeDetector'ü olmayan tarayıcıda da çalışır.
- Yeni paket yok (jsqr `package.json`'da zaten var). Excel içe/dışa aktarma (ExcelJS, SheetJS) depoda olmadığı için açık kaldı; yeni paket onayı ister.
- `katalog.html`, sunucu, şema, işlem ve rol değişmedi.

# FARK: Logo'ya gönderilen tür ve birim karşılığı karta yazılır (borç 259, satın alma ve sevkiyat şeridinin isteği)

- `malzemeLogoSonucu` (disari.ts) `{ kayitNo }` sonucunda isteğe bağlı `logoKartTuru` ve `logoBirimSeti` alır: Logo'ya gerçekten giden değerler (kuyruktaki alanlar). Verilirse karta onlar yazılır; kuyruk okunduktan sonra değişen karşılık yazılmaz. Verilmezse bugünkü gibi o anki karşılık yazılır (logo modülü değişene kadar davranış aynı).
- Boş ya da 40 karakteri aşan değer 400 (`DOGRULAMA`); null "karşılık yok" demektir.
- Şema, göç, işlem ve rol değişmedi. Logo modülünün değerleri geçirmesi o şeridin işi (`sunucu/moduller/logo/servis.ts`).

# FARK: ekran dışında yazılmış hammadde kartı açılıyor ve dışa aktarılıyor (uçtan uca deneme ikinci tur, YÜKSEK)

- Hata: örnek veride (`ornek-veri.ts`) hammadde kartı ekranın taslak alanları (`opts`, `dims`, `ov`, `extra`, `stds`, `custom`) olmadan yazılıyor; katalogda satıra tıklama, CSV ve JSON dışa aktarma "Cannot read properties of undefined (reading 'durum')" ile duruyordu.
- Ekran (`katalog.html`): liste yüklenince (`hostYenile`) hammadde kartının eksik taslak alanları boş değerle tamamlanır (`kartTamamla`); dolu alana ve hammadde dışındaki karta dokunulmaz. Bayrağı olmayan kartın kodu ve adı sunucudaki değerdir (`kodManual`, `adManual`); ekranın kaydettiği kartta bayrak hep vardır, değişmez.
- Süzgeçte sınıfı olmayan hammadde "Sınıf: undefined" seçeneği üretmiyor.
- Test: `istemci/src/moduller/malzemeler/MalzemeKatalogu.test.tsx` çerçevenin sunduğu sayfayı koşturur (düzeltmeden önce kırmızı, sonra yeşil).
- Sunucu, şema, göç, işlem ve rol değişmedi; örnek veri değişmedi (kurulu sistemlerdeki örnek kartlar da açılır).

# FARK: katalog kart listesi sayfalı ve oturum önbellekli, kart #1323 (dal 1323-malzeme-sayfali)

- `GET /malzeme-katalogu-kartlari` sayfalıdır (`sayfa`, `sayfaBoyu`; varsayılan 200, üst sınır 500; kart numarası sırasıyla). Cevap `{ satirlar: [{ kimlik, kayit, surum }], toplam, sayfa, sayfaBoyu, an }`; eski `{ kartlar }` biçimi kalktı (tek kullanıcısı köprü). İptal kart gövdesiz (`kayit: null`) gelir.
- `sonra` (zaman) verilirse yalnız o andan sonra değişen kartlar gelir; okuma `guncelleme`ye 5 dakika pay bırakır (uzun süren yazma transaction'ı kaçmasın).
- Köprü (`kopru.ts`) sayfaları birleştirir ve kartları oturum boyunca bellekte tutar (kullanıcı kararı "Önbellek"); sayfa yeniden açılınca yalnız değişenleri ister. Ekran (`katalog.html`) değişmedi.
- Şema, göç, işlem ve rol değişmedi. Mal kabul katalog araması (#1313) bu ucu kullanmıyor (`malzemeAra`).

# FARK: genel aramada kayıtlar, kart #1221 (dal 1221-hizli-git-uclar)

- Uç ayrı dosyada (`arama/uclar.ts`, test `arama/arama.test.ts`; yeni SQL yok); `uclar.ts`'te yalnız kayıt satırı. `GET /malzemeler/ara?q=` (okuma uçlarıyla aynı yetki): var olan `malzemeAra` ile kod ya da adda geçen en çok 5 kart (iptal hariç). Karta doğrudan açılan adres yok; sonuç `/malzemeler` katalog sayfasını açar. Sayfa tanımına `aramaUcu` satırı.
- Şema, göç, işlem ve rol değişmedi.

# FARK: malzemeler, ticari mal ekranı (kart #1218, dal 1218-ticari-mal-ekran; taban 1218-ticari-mal)

Kullanıcı kararları ilk PR'daki gibi (14.10.2026). Göç, uç ve rol x işlem değişikliği yok; ekran var olan tür düzeniyle gelir.
## Değişen
- `katalog.html`: `TURLER` ve `TUR_ICON` içinde ticari mal; adımlar Tanım (ad, grup, marka, model, açıklama), Ticari bilgiler (üretici ürün kodu, tedarikçi,
  depo yeri, barkod, GTİP, menşei, sertifika), Özet. Kod TM-grup-sıra (`KOD_TUR`, `KOD_DESEN`, `gKod`); ad, açıklama 1-2-3, mükerrer anahtarı (marka + üretici kodu),
  föy ve etiket. Reçete bileşeni seçicisi ticari malı göstermez (TM3). Stok birimleri ayarında ticari mal listesi. GTIN denetimi.
- `LogoGonderimi.tsx`: tür adı "Ticari mal"; karşılık penceresinde ticari mala yalnız 1, öteki türlere 1 dışındakiler (TM2).
## Bu turda varsayılanlar
1. Birimler: adet, takım, set, kutu, paket, kg, m, L.
2. Kod grubu ürün grubunun ilk üç harfinden, yoksa addan (mamuldeki gibi); teknik kod yapısında da TM-grup-sıra.
3. Excel aktarımı ticari malı kapsamaz (hizmet gibi); sonra eklenebilir.

# FARK: malzemeler, ticari mal türü (kart #1218, dal 1218-ticari-mal; taban main 80f99f1)

Kullanıcı kararları (14.10.2026, karar kartları): ticari mal kategori değil yeni türdür, Logo kart türü 1; reçetede girdi olamaz; recete-rota ve stoktaki
iki derleme satırı bu PR'da ayrı commit; "Yaz". Uç ve rol x işlem değişikliği yok. Ekran ikinci PR'dadır.
## Değişen
- Göç `20261014085745_malzemeler_ticari_mal.sql`: `malzeme_katalog_karti_tur` ve `malzeme_logo_karsiligi_tur` kısıtlarına `ticari_mal`; `malzeme_logo_karsiligi_izinli`
  ticari mala yalnız 1, öteki türlere 1 yasak. TM önekli kart ya da 1 değerli tür karşılığı varsa göç durur. Satır değişmez.
- `paylasilan/sozlesme/malzemeler.ts`: `KATALOG_TURLERI` ve `LOGO_TUR_KARSILIGI_TURLERI` içinde `ticari_mal`; `LOGO_KART_TURLERI` içinde `{ kod: '1', ad: 'Ticari mal' }`.
- `kurallar.ts`: TM öneki (`KOD_ONEKI_DESENI`, `TUR_ONEKI`, `TUR_KISALTMALARI`: firma kodu TM olamaz); `logoKarsiligiHatasi` ticari mal kuralı (TM2).
- `sorgular.ts` `katalogBilesenOlamayanKodlar` (eski `katalogHizmetKodlari`): hizmet ve ticari mal reçete bileşeni ve operasyon sarfı olamaz (TM3); ileti değişti.
- `servis.ts`: karşılık kısıtı iletisi "altı malzeme türü".
- Başka modülde ayrı commit (karar kartı): `recete-rota/kurallar.ts` `KATALOG_TURU_PROTOTIP` ticari_mal -> 'ham' (geçici); `istemci/src/moduller/stok/gorunum.ts` `MALZEME_TURU` "Ticari mal".
## Bu turda varsayılanlar
1. Stok kodu öneki TM (TM-XXX-00001); grup kodunu ekran verir (ikinci PR).
2. Ticari malda benzersiz anahtar zorunlu değil (demirbaş ve mamul gibi); kategori yok.
3. Logo kart türü 1 = ticari mal: DOĞRULANMADI (Logo kılavuzu depoda yok); yanlışsa kısıttaki ve sözleşmedeki tek değer değişir.
4. Ticari mal stoklanır ve lot alır: stok kuralı (`stoklanirMi`, `partiGereksinimi`) bunu kendiliğinden verir, stok koduna dokunulmadı.

# FARK: malzemeler, örnek veri (kart #906, dal 906-ornek-veri-malzemeler; taban main 547bcbfd)

Kullanıcı: "tüm sistem için her yerde örnek veriler hazırla" ve "Yaz" (13.10.2026). Göç, uç, ekran ve rol x işlem değişikliği yok.
## Değişen
- `ornek-veri.ts` (gerekir: kisiler): yedi kart servis üzerinden açılır, ornek.planlama açar, ornek.mudur onaylar: üç mamul (Mil, Flanş, Burç), iki hammadde (çubuk, levha), bir sarf (kesme yağı), bir alınan hizmet (ısıl işlem).
- `disari.ts`: `malzemeNoKoddan(db, stokKodu)`, `ornekMalzemeNo(db, anahtar)` ve `ORNEK_MALZEME_ANAHTARLARI`.
## Bu turda varsayılanlar
1. Plandaki "ORN-MM-001" biçimi verilemez: stok kodunu sunucu verir. Kodlar MM-ORN-00001.., HM-ORN-, SF-ORN-, HZ-ORN-; firma kodu ayarlıysa mamul FİRMA-MM-sıra alır. Bu yüzden başka modüller örnek kartı anahtarla (`ornekMalzemeNo`) bulur.
2. Yedi kartın hepsi aktif (stok ve satın alma kullanabilsin); reçete ve operasyon yok (rotayı Rota payı kurar).
3. Örnek kart kimliği `ornek-` önekli; `yukluMu` buna bakar.

# FARK: malzemeler, Logo'daki kartın adı güncellenir (kart #783, dal 783-logo-ad-guncelleme; taban main a3f4420d)

Kullanıcı kararı S4 b (Logo oturumu) ve göç onayı "Ekle" (12.10.2026). Uç ve rol x işlem değişikliği yok.
## Değişen
- Göç `20261012112200_malzemeler_logo_guncelleme.sql`: `malzeme_katalog_karti`'na boş olabilen üç sütun (`logo_guncelleme_durumu`, `_hata`, `_zamani`) ve bütünlük kısıtı; satır değişmez.
- Logo kaydı olan kartın adı değişince kart kaydıyla aynı işlemde güncelleme "bekliyor" olur. `disari.ts`: `logoyaGuncellemeGidecekMalzemeler`, `malzemeLogoGuncellemeSonucu` (NOTLAR madde 7).
- Logo gönderimi sayfası: Durum hücresinde "Ad güncellemesi bekliyor" ya da "Ad güncelleme hatası" rozeti; güncelleme hatası "Son hata" sütununda. Düzen aynı.
## Bu turda varsayılanlar
1. Ad değişimi veritabanının okuduğu adla ölçülür (baştaki ve sondaki boşluk sayılmaz). Geri alma: kural tek işlev.
2. Sonuç gönderilen adı taşır; ad bu arada yine değiştiyse sonuç yok sayılır. Geri alma: imza Logo modülüyle birlikte değişir.
3. Hatalı güncelleme kuyrukta kalır, sonraki turda yeniden denenir; hata yazımı zamanı yeniler, sıranın sonuna geçer.
4. İlk gönderimi bekleyen kartta ad değişimi güncelleme açmaz.

# FARK: malzemeler, kartın operasyonları rotaya açıldı (kart #688, dal 688-malzeme-operasyonlari; taban main 708190c4)

Kullanıcı kararı (karar kartı, 12.10.2026): "Karttan aktar": kartta girilen operasyonlar kart onaylanınca Rota'ya taslak rota olarak kopyalanır. Göç, uç ve rol x işlem değişikliği yok.
## Değişen
- `disari.ts`: `malzemeOperasyonlari(db, no)` kartın `ops[]` listesini `{ no, kod, ad }` olarak no sırasıyla verir; kart yoksa null. Taslak rotayı açmak Rota'nın işi (aynı kart, Rota tarafı).
- `disari.ts`: `operasyonluAktifKartlar(db)` kodlu operasyonu olan aktif mamul ve yarı mamul kartları `{ no, kisiId }` olarak verir. Kullanıcı (12.10.2026): taslak kart onaylanınca kendiliğinden açılsın; tetik Rota'nın zamanlayıcı işinde, çünkü malzemeler rota/disari'yi ithal edemez (rota zaten malzemeler'i ithal ediyor, döngü).
- Kartın Operasyonlar adımında (yarı mamul ve mamul) Rota başlığının altında şablon seçimi, "Şablondan doldur" ve "Şablonları düzenle". Şablonlar Rota'nındır
  (`GET /rota/sablonlar`, #702); köprü `rota-sablon-liste` isteğiyle okur, kart yalnız sıra, kod ve adın kopyasını alır. Varsayılan şablon seçili gelir.
  Rota doluysa düğme "Şablonla değiştir" olur, ikinci dokunuşta ("Rota değişsin mi?") rota şablonla değişir. "Şablonları düzenle" Rota > Rota şablonları sayfasına gider.
## Bu turda varsayılanlar
1. Kodu boş satır aktarılmaz; ad yoksa null. Numara ekranın kuralıyla verilir, rota için tekil ve artan yapılır (eşit numara bir fazlası).
2. Yalnız sıra, kod ve ad aktarılır; süre, istasyon, karakteristik, sarf ve alet kartta kalır.
3. Eski prototip kodları (ör. TL01) çevrilmez; yeni kartlar istasyonlar kodlarını taşır.
4. Şablon kartın rotasına kendiliğinden yazılmaz; kullanıcı bir dokunuşla doldurur (varsayılan şablon seçili gelir). Numaralar 10, 20, 30 diye verilir.
5. Salt okunur kullanıcıda şablon denetimi görünmez.

# FARK: malzemeler, rota adımında operasyonlar türün yanında (kart #665, dal 665-rota-operasyon-yanda; taban main 300f9fdf)

Kullanıcı: "OPERASYON EKLEDE OPERASYON SEÇİNCE OPERASYONLAR AŞAĞIDA AÇILIYOR, YANINDA AÇILSIN" (12.10.2026). Yalnız `katalog.html` CSS ve bir sarmalayıcı; veri ve akış aynı.
## Değişen
- "Operasyon ekle" panelinde türler (`.optur`) ve operasyonlar (`#opSec`) `.opsec` iki sütun ızgarasında: türler solda, seçilen türün operasyonları sağında. Panel 420-480px.
- Çerçeve 1000px altında ya da 1101-1400px arasında (adım sütunu görünürken) panel rota tablosunun üstüne geçer; iki sütun sürer. 560px altında türler üstte yatay çip, operasyonlar altta (eski dar ekran düzeni).
## Bu turda varsayılanlar
1. Rota tablosuna yer kalmayan genişlikte (1366, 1440 ekran) panel rotanın üstünde durur; rota aşağı kaydırılarak görülür.
# FARK: malzemeler, mamul kodu FİRMA-MM-sıra (kart #652, dal 652-mamul-firma-kodu; taban main d9d5836d)

Kullanıcı: "MAMÜLDE FİRMA KODU+MM+NUMARA OLSUN, FİRMA KODU SİSTEM AYARLARINDAN BELİRLENSİN" (12.10.2026). Göç, uç ve rol x işlem değişikliği yok.
## Değişen
- Genel ayara `firmaKodu` eklendi (2-5 büyük harf ya da rakam; HM, YM, MM, SF, DB, HZ olamaz). Malzeme ayarları > Mamul alanları ile Ayarlar penceresindeki "Malzeme kodu" kutusunda girilir; Sistem Ayarları'nda da görünür.
- Firma kodu doluysa firma kodlu türlerin (genel ayar `firmaKoduTurleri`, varsayılan mamul ve yarı mamul) öneki `FİRMA-TÜR-` (2026-10-15); öneki sunucu ayardan kurar (`katalogFirmaOneki`), ekranın gönderdiği önek yok sayılır. Sıra önek başına sayaçtan.
- Genel ayar kaydında `firmaKodu` gönderilmezse kayıtlı değer korunur (eski sekme silmesin); boş metin siler. Geçersiz firma kodu 400 (`deger.firmaKodu`). Ekranın `KOD_DESEN`'i yeni biçimi de standart sayar (kod geçişi düğmesi bu kartları saymaz).
## Bu turda varsayılanlar
1. Firma kodu kurumun tek kodudur, müşteri firmanın kodu değil. Geri alma: önek kaynağı.
2. Firma kodu boşsa mamul tür-grup-sıra yapısında kalır.
3. Var olan kodlar değişmez; firma kodu değişince yalnız sonra açılan kartlar yeni öneki alır. Yeni önek 00001'den başlar, daha önce kullanılmış koda dönülünce sıra kaldığı yerden sürer.
4. Teknik kod yapısı seçiliyken ekran teknik kodu gösterir; sunucu yine FİRMA-MM- verir (sunucu kodu her zaman verir, #230).
5. Firma kodu doluyken mamulde "Kod grubu" alanı kapalıdır.

# FARK: malzemeler, ayarlar Sistem Ayarları'nda da (madde 8, çekirdek #591, dal 591-malzemeler-ayar; taban main 695a6c8)

Kullanıcı: "diğer sayfalardaki ayarların hepsini ayarlar sayfasına da al, yerlerinde de kalsın" ve "a" (11.10.2026). Göç, uç ve rol x işlem değişikliği yok.
## Değişen
- `ayar-ekranlari.tsx`: tek bölüm "Malzemeler ve Hizmetler" (`sayfa.malzemeler`): prototipin "Malzeme ayarları" görünümü kendi çerçevesiyle ve altında Logo karşılıkları.
- `MalzemeKatalogu.tsx`: çerçeve `KatalogCercevesi({ gorunum })` olarak ayrıldı; sayfa görünümü adresten verir, Sistem Ayarları `mayar` verir.
- `LogoGonderimi.tsx`: Logo karşılıkları kartı `LogoKarsiliklari` bileşeni oldu; Logo gönderimi sayfası onu kullanır (ekran aynı).
## Bu turda varsayılanlar
1. Bölüm sayfayı gören herkese görünür (menü maddeleri gibi); yazma uçlarda kalır (`malzemeler.tanim-yaz`). Geri alma: `islem`.
2. İki ayar tek bölümde: Sistem Ayarları'nda modül başına bir başlık. Geri alma: diziye ikinci ekran.
3. Çerçeve içinde kullanıcı başka görünüme geçebilir (prototipin kendi bağlantıları); çerçeve yüksekliği ekrandan üst çubuk düşülerek verilir.

# FARK: malzemeler, Operasyonlar görünümü kalktı (B1 M1, kart #544, dal 544-malzemeler-op; taban main 8c7ff46)

Kullanıcı: B dağıtımı "1yaz, 2a" (11.10.2026). Sahibi istasyonlar (I1, #548). Göç ve rol x işlem değişikliği yok.
## Değişen
- İkinci menüden "Operasyonlar" maddesi (`op`, `/malzemeler/operasyonlar`) ve `GORUNUM_YOLLARI.op` kalktı; eski adres kataloğa döner.
- Köprü `hazir`: operasyon listesi her zaman istasyonlardan ve kaynağıyla gider; liste boşken de dışarıdan sayılır, prototipin kendi düzenlenebilir listesi (eski ayar deposu) açılmaz.
- Rota adımı seçicideki "... sayfasında belirlenir" bağlantısı "İstasyonlar > Operasyon tipleri" yazar ve kabuğu `/istasyonlar/operasyon-tipleri`'ne götürür: çerçeve `git` isteği yalnız bilinen anahtarla (`DIS_SAYFALAR`, istasyon menüsüne tiple bağlı) gönderir.
- Dokunulmayan: `operasyonTipleri` beslemesi (`servis.ts`), `malzeme_katalog_ayari` `operasyonlar` satırı ve yazım ucu, kart içi `kayit.ops[]`, prototipin bağımsız kipteki Operasyonlar bölümü.
## Bu turda varsayılanlar
1. İstasyonlarda tip yoksa seçici boş görünür; yerel liste açılmaz. Geri alma: köprüdeki koşul.
2. Bağlantıya gidilmeden taslak kaydedilir (eski davranış). Geri alma: tıklama işleyicisi.
3. Bağlantı her role görünür; `sayfa.istasyonlar` işlemi olmayanı kabuk yetkisiz sayfasına götürür (denetim bulgusu, bağlamada rol matrisiyle bakılır). Geri alma: köprüye işlem koşulu.
4. Boş listede yerel kipin kapalı kalması (prototipte `operasyonKaynagi` koşulu) otomatik testsizdir: prototip betiğini koşan test yok (denetim bulgusu, mutasyonla görüldü); borçta.

# FARK: malzemeler, ana sayfa pano kartı (kart #489, dal 489-malzemeler-pano; taban main 354009a)

Kullanıcı: rol panoları kartları için "yaz" (11.10.2026). Göç ve rol x işlem değişikliği yok.
## Değişen
- `GET /malzemeler/ozet` (yetki: oturum): `onayBekleyen` = onaydaki kart + iptal dışı kartta bekleyen değişiklik talebi (katalog sayımıyla aynı); `malzemeler.onayla` işlemi olmayana `null`.
- İstemci `ana-sayfa.tsx`: "Bana düşen işler" bölümünde "Onay bekleyen malzeme" kartı (`malzemeler.onayla` ile görünür), kataloğa gider.
## Bu turda varsayılanlar
1. Değişiklik talebi de onay bekleyen sayılır (prototip ikisini de onaylayana bırakır). Geri alma: sorgudaki talep koşulu.
2. Dört göz kuralı (kendi gönderdiğini onaylayamaz) sayıya yansımaz; sayı katalogdaki "onayda" ve "talep" sayımıyla aynıdır. Geri alma: sorguya gönderen koşulu.
3. Kart kataloğun köküne gider, onay süzgeci açık gelmez (prototip ekranına dokunulmadı). Geri alma: köprüye süzgeç parametresi.

# FARK: malzemeler, operasyon listesi istasyonlardan (A7, kart #515, dal 515-operasyon-katalogu; taban main 1637f9f)

Kullanıcı: 1-a "ikinci ekran salt okunur, sahibinden gösterir" ve "a7yaz" (11.10.2026). Sabit kimlik: operasyon tipi istasyonlarda kalır.
## Değişen
- `GET /malzeme-katalogu-ayarlari` cevabına `operasyonTipleri` (kod, ad, grup, grup adı, aktif; pasifler dahil) eklendi; kaynak `istasyonlar/disari.ts` `operasyonTipleri` (MKK-18). Yeni yön malzemeler -> istasyonlar, döngü yok.
- Köprü bu listeyi prototipin dış operasyon listesi (`operasyonlar`) olarak verir; prototip onu salt okunur gösterir (Operasyonlar görünümü ve kart içi seçim). Uyarı metni "İstasyonlar > Operasyon tipleri sayfasından geliyor" olur (`OP_KAYNAK`).
- Silinmeyen: `malzeme_katalog_ayari` anahtar `operasyonlar` satırı ve yazım ucu; kart içi `kayit.ops[]` (rota, RT1 a).
## Bu turda varsayılanlar
1. Katalogdaki açıklama, varsayılan istasyon metni ve fason işaretinin istasyonlarda karşılığı yok: gösterilmez; fason, grup FAS'tan türetilir. Geri alma: köprü eşlemesi.
2. İstasyonlarda tip yoksa (boş liste) katalog kendi listesine döner ve düzenlenebilir. Geri alma: köprü koşulu.

# FARK: malzemeler, sipariş noktası ve depo yeri stoktan (A7, kart #516, dal 516-siparis-noktasi-depo-yeri; taban main 1637f9f)

Kullanıcı: 2-a, 3-b ve "a7yaz" (11.10.2026). Sunucu kodu değişmedi.
## Değişen
- Köprü `liste`: kartların sipariş noktası stoktaki kritik seviyeden, depo yeri stoktaki varsayılan konumdan yazılır (`GET /stok/malzeme-kart-bilgileri`, `stokluKayit`). Stokta konum yoksa kartın eski depo yeri metni kalır; stok okunamazsa kartlar olduğu gibi gelir.
- Kart formunda "Depo yeri" salt okunur, etiketinde "(Stok > malzeme ayarından)"; `fld` salt okunur seçeneği aldı (`ro`).
- Kart kaydedilince gösterilen değerler kartın jsonb'sine de yazılır (kopya güncel kalır); `kayit.g.depoYeri` silinmez.
## Bu turda varsayılanlar
1. Stokta varsayılan konum yoksa eski metin gösterilir. Geri alma: `stokluKayit`.

# FARK: malzemeler, tedarikçi finans firmasından (kart #466, Refs #163, dal 466-malzemeler-tedarikci-firma)

Tekrar eden sayfaların temizlik planı (`bagla/tekrar-temizlik-plani.md`, malzemeler, Varsayılan madde 11): kart tedarikçisi serbest metin yerine finanstaki firmadan seçilir.

## Değişen
- Uç `GET /malzeme-firma-secenekleri?ara=` (işlem `malzemeler.yaz`): finansın aktif tedarikçi firmaları adla aranır (`../finans/disari.ts` `firmaAra`, satın almanın firma seçimiyle aynı süzgeç).
  Okuma genişlemesi (kullanıcı kararı 11.10.2026): uç `finans.firma-oku` istemez; `malzemeler.yaz` olan kalite ve cam rolleri tedarikçi firma ad ve kodunu görür.
- Kart kaydı: `kayit.com.tedId` doluysa pozitif sayı olmalı (değilse 400). Yeni ya da değişen bağ finansta aktif tedarikçi (ya da ikisi) türünde firma olmalı (değilse 422); bağ değişmeden kalan kart, firma sonradan pasif olsa da yeniden kaydolur. Bekleyen değişiklik talebinin önerdiği kartın bağı da aynı denetimden geçer. Tür kuralı finansın `tedarikciOlabilirMi` fonksiyonundan (kopya yok).
- Ekran (`katalog.html`): sunucuya bağlıyken tedarikçi alanı firma arar; seçilen firmanın kimliği ve adı karta yazılır, "Değiştir" bağı kaldırır.
  Seçilmemiş eski metin kartta kalır ve "Kayıtlı metin" diye gösterilir. Şablon ve yeni kart başlangıcı firma bağını da taşır; Excel'de tedarikçi adı değişince bağ düşer.
- Köprü: `firma-ara` isteği yalnız arama metnini sabit uca taşır. Sözleşme: `firmaSecenekleriSorgusu`, `firmaSecenekleriCevabi`.

## Bu iş şunları varsaydı
1. Arama ve sunucu yalnız aktif ve tedarikçi (ya da ikisi) türündeki firmayı yeni bağ olarak kabul eder; müşteri firması seçilemez.
2. Eski kartlardaki tedarikçi metni silinmez ve kendiliğinden firmaya eşlenmez; kart açılıp firma seçilince bağlanır.
3. Kayıt kimliği zorunlu tutmaz: firma seçmeden kaydedilen kart tedarikçisiz ya da eski metinle kalır.
4. Sunucusuz açılışta (prototip tek başına) alan serbest metin kalır.
5. Stok özetindeki `tedarikci` metni (adı) değişmedi; kimlik özete girmez.

## Aynı dalda: aktif kartta boş birim (kart #423 borcu)
- Onay akışında birimi boş aktif kart değiştirilmeden kaydedilince "Kartta değişiklik yok" deniyordu (fark tablosu birimi ekranda gösterilen değerle karşılaştırıyor).
  Artık boş birimin dolması değişiklik sayılır: değişiklik talebi "Stok birimi" satırıyla gider, onaylanınca birim karta yazılır. Excel'de "aynı" çıkan satır da bu farkla güncellenir.
- Varsayım: birim, onay akışını atlamaz; aktif kartta ancak talep onayıyla dolar.

# FARK: malzemeler, Akış C düzeltmesi (kart #423, Refs #163, dal 423-malzemeler-akis-c)

Akış C denemesinde (H5) malzeme kartının birimi kaydolmuyordu: ekran varsayılan birimi ("adet") gösteriyor, karta yazmıyordu; satın almada "Kataloğa ekle" 400 "Malzeme kartının birimi yok" veriyordu.

## Değişen
- Ekran (`katalog.html`): sihirbaz kaydında, varyant oluşturmada ve Excel içe aktarmada kartın birimi ekranda görünen birimle (`finalBirim`) doldurulur.
  Birimi boş taslak kart yeniden kaydedilince birimini alır; onay akışındaki aktif kart ancak başka bir değişiklikle (talep) birimini alır. Sunucu, sözleşme ve göç değişmedi.

## Bu iş şunları varsaydı
1. Kaydedilen birim, ekranın gösterdiği varsayılandır (formdan ya da türden); kullanıcı seçtiyse onun seçimi.
2. Birimi boş eski kartlar toplu doldurulmaz (göç yok); kart açılıp kaydedilince dolar.
3. Değişiklik talebi ve onay uygulamalarında (`Store.put`) birim doldurulmaz; talebin içeriği olduğu gibi kalır.

# FARK: malzemeler, Aşama 2 bağlama tur 1, hizmet çeşitleri (kart #163, dal 163-malzemeler-oturtma-o7b51n, taban main 48b5e17)

Kullanıcı isteği 09.10.2026: hizmette çeşit, çeşidin kalitesi ve standardı ve isterleri malzemedeki gibi alt kategorilensin (boya, alodin, hidrojen gevrekliği giderme...).
Öneri (`/mnt/project-files/bagla/malzemeler-hizmet/cesit-agaci.md`) "yaz" ile onaylandı. Hizmet türü önceki turda PR #380 ile ana dalda.

## Değişen
- Ekran (`katalog.html` `HZ_KAT`): hizmet grubu başına çeşit listesi; her çeşidin kodu, standart önerileri ve isterleri (sarf kategorisindeki alanlar gibi).
  Yeni gruplar: Yüzey işlem ve kaplama (YZY), Isıl işlem (ISL), Muayene ve test (MYT). Var olan gruplara çeşit eklendi; her grupta adı elle yazılan "Diğer".
- "Hizmet tanımı" adımı: yön, çeşit (zorunlu), standart (serbest metin, çeşidin önerileri), çeşidin isterleri, ad, kapsam. Çeşit değişince eski çeşidin isterleri silinir.
- Stok kodu çeşidin koduyla (`HZ-ALD-00001`); "Diğer"de grubun koduyla. Ad boşsa çeşit, standart ve `ada` işaretli isterlerden kurulur (ör. "Alodin MIL-DTL-5541 Tip II Sınıf 3").
- Mükerrer anahtarı: yön, grup, çeşit, standart ve isterler (ad ve kapsam girmez); aynı anahtarlı ikinci kart malzemedeki gibi gerekçe ister.
- Göç `20261009061715_malzemeler_hizmet_cesit.sql`: grup listesine üç yerleşik grup. Önce sayar; aynı anahtarlı hizmet grubu varsa hiçbir şey değişmeden durur. Var olan satır değişmez.
- Sunucu kodu ve sözleşme değişmedi; çeşit ve isterler kartın içinde (`kayit.g`) durur.

## Bu iş şunları varsaydı
1. Standart numaraları genel bilgiden önerildi; kullanıcının listesiyle karşılaştırılmadı. Standart alanı serbest metin, öneri dışı değer yazılabilir.
2. Kod grubu çeşide göre (malzemede sınıfa göre olduğu gibi); "Diğer" çeşit grubun kodunu alır.
3. Ad elle yazılmazsa çeşit, standart ve tip/sınıf gibi isterlerden kurulur.
4. Çeşit ve isterler özete ve aramaya girmez (`malzemeAra` çeşide göre süzmez); rota ya da satın alma isterse ayrı iş.
5. Çeşit ve ister listeleri Ayarlar'dan genişlemez; listede olmayan için "Diğer" çeşit ve serbest standart alanı var.
6. Muayene ve test ayrı grup (penetrant, manyetik parçacık, sertlik).

- Malzeme ayarları > Ad, açıklama ve zorunlu alanlar (2026-10-15): tür başına kart adı ve Açıklama 1-3 kalıbı ({alan}, {OTO}, {AD}) ve zorunlu alanlar; `malzeme` ayarının `kurallar` alanında. Boş kalıp bugünkü otomatik değeri verir.
- Çakışma kontrolü alanları (2026-10-15): tür başına seçilen alanların hepsi aynıysa yeni kart "aynı" sayılır (gerekçe istenir); seçim yoksa yerleşik kural. Sunucu aynı alanlardan benzersiz anahtar kurar ve gerekçesiz mükerreri engeller; ayar değişince türün kartlarının anahtarı yeniden hesaplanır, etkin kartlar birbirine çakışırsa ayar kaydedilmez (kullanıcı kartı "Uyarı ve engel" ve yazılı onay; yeni sütun `varsayilan_anahtar`).
- Şablon silme düğmesi (2026-10-16): yalnız sunucunun kaldırabilir dediği şablonda görünür (kaydeden ya da onay yetkilisi); sunucusuz açılışta bugünkü gibi her kayıtlı şablonda. Yeni görünüm yok.

## Etiket yalnız Etiket Merkezi'nde (kart #1308, 1288 teyitli, 30.10.2026)
- Katalogdaki yerel etiket penceresi (`katalog/EtiketPenceresi.tsx`, ölçü seçimi, SVG/HTML indirme, tarayıcı baskısı) kalktı; kart penceresi ve saha görünümündeki "Etiket" düğmesi kalktı, yanındaki "Etiket Merkezi'nde bas" kalır.
- Seçim çubuğundaki "Etiket yazdır" ve karşılaştırmadaki "Etiketlerini yazdır" aynı yerde "Etiket Merkezi'nde bas" oldu: seçili kartların nolarıyla `/etiket-merkezi?tur=malzeme&id=<no,no,...>` açılır (en çok 200; hizmet kartı düşer). Yalnız `sayfa.etiket-merkezi` olan görür.
- Sonuç: Etiket Merkezi'ni açamayan malzeme kullanıcısı artık etiket basamaz (1288 ile bilinçli). Baskı Etiket Merkezi defterine yazılır.
- Sunucu, göç ve yetki değişmedi.
