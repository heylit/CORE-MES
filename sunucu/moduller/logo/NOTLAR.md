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
- Artımlı fiş (233, okuma teyidi 23.10.2026; 264 1a, 2a; 269 1a, 2a): fiş hazırlıkta (uretim-emirleri `hazirlikTamamlandiDinle`) TMI'de boş açılır;
  sağlam ve hurda sayımı `bekleyen_degisiklik` sayacını artırır. Logo işi satırları sahiplerinden okur, `son_satir_ozeti` ile karşılaştırır; farklıysa fişi
  siler (Logo'da satır silinmez) ve sonraki turda aynı numarayla açar, boşsa siler. Sayaç işaret değil sayaçtır: istek sürerken gelen sayım kaybolmaz.
  VARSAYIM: Logo boş fişi kabul etmez (bu yüzden boş fiş TMI'dedir); fiş tarihi fişin TMI'de açıldığı andır; gerçek Logo'da silme denenmedi.
- Tüm Logo işleri `isler.ts` `sirali` kuyruğundan geçer: ayrı zamanlayıcıda koşsalar da köprüye aynı anda iki istek gitmez (tek COM oturumu).
