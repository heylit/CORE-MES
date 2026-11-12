# logo notları (kart #207)

- Logo ile yalnız bu modül konuşur (ADR 0011 karar 3; karşı uç aynı bilgisayardaki Logo yardımcısı, ADR 0017). Malzeme kartı ve ad güncellemesi gider; satın alma (talep fişi, sipariş açma, düzenleme, kapatma, iptal,
  talep karşılaması; kart #777 S1 a, S2 b, S3 b) ayrı ayarla kapalı (`logo.satin-alma-gonderimi`) ve kaynağı satın alma işlevleri gelene kadar iş
  listesinde yok (`satinAlmaIsi`). Firma kartı yazılamaz (köprüde cari yazma ucu yok, yalnız `Arp/find`). Yeni belge türü `logo_giden.belge_turu`
  kısıtına ve kendi turuna eklenir. Satın alma turu sırası: talep, açma, düzenleme, kapatma, iptal, karşılama (karşılama ancak iki taraf Logo'dayken).
- Sipariş: Logo'da güncelleme hep Read+Modify+Post ucuyla olur, XML `UPD` "duplicate key" verir (köprü notu). Düzenleme yinelenebilir olsun diye önce
  Logo satırları okunur: önceki denemede eklenmiş ama TMI'ye bağlanmamış satır kaydıyla gider, ikinci kez eklenmez. Kaldırılan satırın kaydı eşlemeye girmez.
- Kalkan "var mı" okuması olmayan belgede (hizmet kartı, talep fişi) yalnız niyettir: taze niyetle gider; sonucu bilinmeyen istekten sonra kendiliğinden
  yinelenmez, "Logo'da kontrol edin" hatası yazılır (kart #777). Karşılama, kapatma, iptal ve düzenleme yinelenmesi zararsız kurulur (karşılama önce listeyi okur).
- Satış (portal, kart #777): teklif `SalesOffer/AddRich` ile, sipariş yalnız tekliften (`SalesOffer/{ref}/toOrder`, satır bağı teklif satırı) açılır;
  ayrı ayar `logo.satis-gonderimi`, ayrı iş `satisIsi` (kaynağı portal). Teklif için cari Logo'da CRM satış müşterisi olmalı (not 2.6, validate 4208):
  istek atmadan önce `SalesOffer/customer/{cari}` okunur. Teklif ve satış siparişini numarayla bulma ucu yok, kalkan yalnız niyet.
  Satış teklifinde iskonto ayrı alandır (`discountRate`); satın alma siparişindeki gibi fiyata yedirilmez.
- Hizmet kartı (`tur = 'hizmet'`) malzeme ucuyla gitmez; `belge_turu = 'hizmet'` satırıyla aynı kalkandan, yönün ucuna gider (alınan
  PurchaseService, verilen SalesService). İki yön Sistem Ayarları'nda ayrı anahtardır, kapalı gelir (`logo.hizmet-alinan-gonderimi`,
  `logo.hizmet-verilen-gonderimi`; kullanıcı kararı 12.10.2026, kart #777). Hizmet "var mı" ucu kılavuzda yok (kalkan yalnız niyet).
  KDV ayrı ayar `logo.hizmet-kdv-orani` (boş varsayılan, boşken gönderilmez).
- Tur tek karttır; köprüyü beklerken transaction açık kalır, "boşta transaction" kesmesi uzatılır (`TUR_BOSTA_SURESI_MS`, havuzdan en çok ~2,5 dk bağlantı).
- Çift gönderim kalkanı üç parçadır, biri yetmez: (1) kalıcı niyet (`logo_giden.niyet_zamani`) açma isteğinden önceki turda yazılır; (2) niyet yalnız
  onu yazan süreçte bir kez taze sayılır, başka her durumda `BELIRSIZ_BEKLEME_MS` beklenir; (3) her gönderim "var mı" okumasıyla başlar.
  Süreç belleği (`SurecBellegi`) veritabanı turu geri alınsa da aynı süreçte ikinci açmayı engeller.
- Tuzak: sahte köprü Logo kayıt numarasını süreç boyunca artırır; testte her köprü 1001'den başlasaydı numara iki karta yazılmaya çalışılır
  (`malzeme_katalog_karti_logo_kayit_no_tek`) ve sonuç "yazilamadi" olurdu. Gerçekte de böyle bir çakışma kartı "hata"ya düşürür, tur düşmez.
- Birim seti karşılığı yalnız kartın birimine bakar, türüne bakmaz: aynı birim (örnek "kg") bütün türlerde aynı Logo birim setine gider
  (kullanıcı kararı 11.10.2026, a). Birim kart başınadır; tür başına birim listesi malzemelerde genişletilebilir.
- Okuma akışları (mal kabul, cari ve ambar, fatura) yalnız GET'tir ve okunanı yalnız saklar; her biri kendi anahtarıyla kapalı gelir. Cevap biçimleri doğrulanmadı:
  ayıklayıcılar esnektir, ayıklanamayan cevap imleci ilerletmez. Fatura numarayla aranır; numara `logo_giden`'de yok, `logo_siparis_no`'ya sipariş açılırken yazılır.
- Malzeme fişinin giden kutusu ayrı tablodur (`logo_malzeme_fisi_giden`): dolu `logo_giden`'in kısıtı genişletilemezdi. Sorgu katmanı `tablo(belgeTuru)` ile seçer.
- Artımlı fiş (233; kart #493 ile kaynak stok): fişin satırı değişince stoktaki sayaç artar, Logo işi akıştan okuyup `bekleyen_degisiklik`e ekler. Logo işi satırları sahiplerinden okur, `son_satir_ozeti` ile karşılaştırır; farklıysa fişi
  siler (Logo'da satır silinmez) ve sonraki turda aynı numarayla açar, boşsa siler. Sayaç işaret değil sayaçtır: istek sürerken gelen sayım kaybolmaz.
  VARSAYIM: Logo boş fişi kabul etmez (bu yüzden boş fiş TMI'dedir); fiş tarihi fişin TMI'de açıldığı andır; gerçek Logo'da silme denenmedi.
- Tüm Logo işleri `isler.ts` `sirali` kuyruğundan geçer: ayrı zamanlayıcıda koşsalar da köprüye aynı anda iki istek gitmez (tek COM oturumu).

## Logo'dan çekme (kartlar 2116, 2118; kararlar 2116-1..5, 2118-1..3)
- Malzeme kartı ve stok toplamı ayrı anahtarla (`logo.malzeme-okumasi`, `logo.stok-okumasi`, kapalı gelir) sayfa sayfa okunur: iş turunda tek sayfa,
  imleç `logo_okuma_imleci`'nde; tam tur ilk açılışta bir kez, sonra yalnız Logo geçişi sayfasındaki "Şimdi oku" ile başlar (3077 a; "Geçişi bitir" okumayı kapatır, kopya kalır). Okunan yalnız aynaya yazılır (`logo_malzeme_karti`, `logo_stok_toplami`); TMI kartına
  ve stoğuna işlemek malzemelerin ve stoğun işidir (2116-1 a: TMI sahiptir). Son sayfada turda görülmeyen satır silinir; boş tam tur aynayı boşaltmaz
  (okuma kazası olabilir). Logo'ya hiçbir şey gitmez.
- Döngü yok: gönderim kuyruğu yalnız `bekliyor` ve `hata` kartları alır; Logo'dan alınan kart `gonderildi` yazılır, açılış devri fiş olarak gitmez (malzemeler, stok).
- Kod eşlemesi (2116-3 c): Logo kodu TMI biçimine uymayan kart TMI'de kendi koduyla açılır, `logo_malzeme_eslemesi` yazılır (değişmez, silinmez). Logo'ya giden
  her belge (kart açma ve güncelleme, sipariş, düzenleme, talep, karşılama, satış teklifi, malzeme fişi) `logoKoduyla` ile çevrilir; okunan satır (mal kabul, fatura)
  `tmiStokKodlari` ile geri çevrilir. Eşlemesi olmayan kod aynen gider.
- Cari arama (2118) kullanıcının isteğiyle, yalnız GET, `logo.cari-aramasi` açıkken; arama 3-100 karakter, en çok 20 sonuç, kullanım dışı cari gelmez.
  Cari kodu Logo'daki gibi alınır (2118-1 a); bağlama ve form doldurma müşteri-tedarikçinindir.
- DOĞRULANMADI: yardımcı uçlarının gerçek Logo'daki sütun karşılıkları (ITEMS, GNTOTST, CLCARD; `kurulum/logo-yardimcisi.md`).
