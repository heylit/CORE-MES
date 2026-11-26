# FARK: smartes (kart #778)

Yeni modül; depoda önceki hâli yok. Brief (`SMARTES_PROMPT.md`, .NET/ASMX için yazılmış) TMI yığınına uyarlandı:

- Ayrı .NET servisi yerine TMI sunucusu SmartES'e doğrudan bağlanır (karar 1a, ADR 0013).
- Kod eşlemesi smartes modülünün `smartes_esleme` tablosunda (karar 2a); başka modüle sütun eklenmedi.
- Okuma ve iş emri gönderimi tek anahtarla (`smartes.baglanti`, varsayılan kapalı; karar 3b).
- SOAP/XML paketi yok: zarf, skaler sonuç, diffgram tablosu ve Fault okuyucu elle yazıldı (`soap.ts`).
- IsErp işaretini TMI koymaz; başka program koyar (346 a). Düşen okuma yine okunur ve SmartES kimliğiyle tekil atlanır.
- Silme metotları (WorkOrdersDelete, OperationDelete) kullanılmaz: plandan düşen emir pasif ya da bitti yapılır.
- Hazırlık ve akış (Sistem Ayarları > Bağlantılar): `GET /smartes/hazirlik` akış başına durum, `.../kontrol` yalnız WSDL ve son bir saatin listesini okur; yetki `saglik.ayrinti-oku`.
- Kalite, hurda ve ambar okuması (`RejectsList`, `WarehouseStatusList`, `QualityControlStatusList`) ve istasyon/stok tanım gönderimi
  (`WorkStationCreateUpdate`, `StockCreateUpdate`) eklendi; her biri kendi anahtarıyla (`smartes.kalite-ambar-okumasi`, `smartes.tanim-gonderimi`,
  varsayılan kapalı) ve ana anahtar açıkken çalışır. Brief 8'deki `...SetIsErp` işaretlemeleri bu akışlarda bilerek yok: okunan kayıt TMI'de
  kimliğiyle tekil saklanır, SmartES'te işaretlenmez; stok ve kalite modülüne işlenmez (bağlamada).
- Yeni tablolar ayrı göçte (`smartes_red`, `smartes_ambar_hareketi`, `smartes_kalite_kontrol`, `smartes_akis_izi`, `smartes_tanim_giden`). Var olan
  `smartes_okuma` ve `smartes_esleme` kısıtları değişmedi; bu yüzden yeni imleç `smartes_akis_izi`nde, tanım sonucu `smartes_tanim_giden`dedir
  (eşleme tablosunda kişi zorunlu, `malzeme` türü yok; kod eşlemesi gönderimle kendiliğinden yazılmaz).
- Tanım gönderiminde brief 8'deki "ERP WorkStationList ile farkı bulur" izlendi: gönderimden önce SmartES listesi okunur. Rota tanımı ve
  `OperationCreateUpdate` ayrı akış değildir; operasyon iş emri gönderiminde zaten açılıyor.
- `GEREKLI_METOTLAR` değişmedi; yeni metotlar `ISTEGE_BAGLI_METOTLAR` listesinde, canlı kontrolde yalnız bildirilir.
- Makine bulguları (3192 a, adım D1): `GET /smartes/makine-bulgulari` (yalnız okur, `sayfa.smartes`); ikinci menüde "Makine bulguları". Canlı durum,
  nedensiz duruş, sayım farkı, termin riski, tekrar eden alarm hesaplanır; program, çevrim, OEE, ilerleme oranı ve takım yükü sonraki adımlardadır
  (kutu "Veri yok"). Makine okumaları yeni `smartes_makine_ornegi` tablosuna eklenir ve silinmez (3200 c). Eşikler `kurallar.ts` `BULGU_ESIKLERI`.

## 3655: operasyon kodu, neden aktarımı, iş merkezi eşlemesi, okuma hatası (24.11)
- A, operasyon kodu: SmartES `OperationCode` = önek + adım no (TRN tipi, op 20 -> TRN20). Önek, tipin `operasyon-tipi` eşlemesi varsa eşlenen koddur, yoksa CORE tip kodudur.
  Tipi olmayan adımın kodu yoktur; iş emri "Adımın operasyon tipi yok" nedeniyle beklemede kalır. Gönderimden önce `OperationList` tur başına bir kez okunur; kod yoksa
  "SmartES'te TRN90 operasyonu yok" nedeniyle bekler (geri çekilmeyle yeniden denenir). `operasyonuHazirla` ve `OperationCreateUpdate` kaldırıldı;
  `OperationList` artık gerekli metottur (`GEREKLI_METOTLAR`). İş emri numarası (`<emir no>-<op no>`) ve sayım okumasının adım bulma yolu değişmedi.
  Çevrim karşılaştırması (`tanimliSaniyeler`) aynı kodu kullanır.
- A, geçici tip kuralı (öneriyle yazıldı): tip kodu SmartES operasyon listesinde aynen varsa (FRZ20) kod aynen gider, adım no eklenmez. Tipin SmartES eşlemesi (önek) varsa
  bu kural uygulanmaz, önek + adım no gider. Çıkarım: kullanıcı eşlemeyi bilerek yapmıştır; geri alma maliyeti tek koşul.
- A, geçiş etkisi: `OperationCode` iş emri özetine girdiğinden canlıda gönderilmiş her açık iş emri ilk turda yeni kodla yeniden gider (QuantityUpdate false). Önce eşlemeleri
  (önek) ve `OperationList`'in okunabildiğini doğrulayın.
- A, eşleme ekranı: operasyon tipi eşlemesinde SmartES kodu "önek"tir; öneri listesi `OperationList` kodlarının sondaki rakamları atılmış halidir (TRN10 -> TRN). Ana tipler
  (TRN, FRZ, OP) için de öneri çıkar. Ekrandaki "SmartES kodu" etiketinin "SmartES öneki" olması bekleyen ekran işidir (ön izleme).
- B, aktarım: `GET /smartes/gelen-adlar/aktarim?tur=` önizleme, `POST /smartes/gelen-adlar/aktar` yazar (yetki `smartes.esleme-yaz`, tek transaction). Aynı adlı CORE nedeni
  (büyük-küçük harf ve boşluk gözetilmez) yalnız eşlenir; yoksa `durusNedenleriEkle` / `hataNedenleriEkle` ile `SME-<SmartES ID>` koduyla eklenir (aktif = SmartES'te pasif değil;
  duruşta kategori grup adında PLANLI geçerse `planli`) ve eşlenir. Var olan nedenler ve eşlemeler değişmez; SmartES'te değişen ad "ad farklı" diye sayılır, güncellenmez.
  Eklenenler denetim kaydına `denetimEki` ile yazılır (neden ekleme işlevi denetim yazmaz). Kimliği, adı olmayan ya da 80 karakterden uzun adlı satır atlanır.
  Fire eşlemesi `sonuc = hatali` ile yazılır (öneri onayıyla aynı varsayım; sonradan değiştirilir). Liste hiç okunmadıysa aktarım 400 döner.
- C, iş merkezi eşlemesi: yeni eşleme türü `is-merkezi` (göç 20261124131000, yalnız kısıt; veri değişmez). İstasyon kodu sırası: istasyonun kendi eşlemesi, iş merkezinin eşlemesi, yoksa atlanır.
  Aynı SmartES koduna birden çok iş merkezi bağlanabilir (istasyondaki gibi). Geri okumada istasyon iş emrinden bulunmaya devam eder, koddan geri bulma bugünkü gibi (`koddanTekKayit`).
  İş merkezi (ya da kendisi) eşli istasyon tanım gönderiminde (`WorkStationCreateUpdate`) gönderilmez. Üretim emri rozeti de iş merkezi eşlemesini sayar.
- D, alarm ve duruş okuması: `SqlDateTime overflow` sahte SmartES'te kodun belgedeki adlarıyla yeniden üretilemedi (tarihler dolu, adlar belgedeki gibi). ASMX adı birebir bağlar;
  serviste tutmayan bir tarih parametresi 0001-01-01 kalıp bu hatayı verir. Bu yüzden (VARSAYIM: canlı WSDL'de ad farkı vardır) okuma çağrısı WSDL ile karşılaştırılır
  (bir saat önbellek): harf ya da alt çizgi farkıyla tek karşılığı olan ad servisin adına çevrilir; karşılığı olmayan ad ve gönderilmeyen zorunlu parametre taşma hatası iletisine
  yazılır ("... gönderilen: ...; serviste karşılığı yok: ...; serviste olup gönderilmeyen: ..."). Canlıda hata sürerse sağlık ayrıntısındaki bu satır kök nedeni verir.
  Alarm kataloğu kurulmadı.

## 3760: SmartES üretimi CORE emirlerine aktarılır (26.11, "Böyle gelsin")
- Ana anahtar `smartes.sayim-aktarimi` (varsayılan kapalı). Kapalıyken hiçbir şey kilitlenmez ve aktarılmaz; canlıdaki bugünkü durum değişmez.
- Üretim kaynağı makine başına: makinenin kendi seçimi (`makine.uretim_kaynagi`, boş = istasyona uyar), yoksa istasyonun `sayim_kaynagi`. Kaynak yalnız
  Geçiş sayfasında (`/smartes/gecis`) değişir: önce önizleme (etkilenen makine, üzerindeki iş, kuyrukta kalan onay), sonra uygula; geçerlilik "şimdi"dir,
  ileri tarih verilemez. İstasyon ve makine formları kaynağı yalnız gösterir. SmartES makinesinde terminalin başlat, duraklat, devam, bitir, sayım ve hurda
  komutları açıklamayla reddedilir; düğmeler görünür ama kapalıdır.
- Hareketler: iş emri durumu her okunduğunda satırın ACTIVITY değeri (1 üretim, 2 ayar, 3 duruş) izle (`smartes_hareket`) karşılaştırılır; fark CORE komutuna
  çevrilir (ayar, başlat, duraklat, devam, durdur, bitir) ve sırayla yazılır. Yalnız CORE'un gönderdiği iş emirleri ve geçerlilikten sonraki satırlar aktarılır.
  Zaman geri gitmez; SmartES'te yazılmış hareketin zamanı sonradan değişirse CORE kaydı değişmez, "zaman değişti" izi düşer (izlemede görünür).
  CORE komutu reddederse hareket "hata" olur, o satırdaki sonraki hareketler bekler; Geçiş sayfasındaki "Yeniden dene" ile yinelenir.
- Kişi: SmartES kullanıcısı (`UsersList`) `kullanici` türüyle CORE kişisine eşlenir. Liste boş başlar; öneri yalnız "Öneriyi kullan" ile uygulanır, toplu eşleme yok.
  Eşlenmemiş kullanıcının hareketi "kişi bekliyor" kalır; eşlenince aynı anla yazılır. Eşleme sonradan değişirse daha önce yazılmış hareketler eski kişide kalır
  (CORE üretim olayı değişmez); yalnız henüz yazılmamış hareketler yeni kişiyle yazılır.
- Duruş: eşlenmemiş SmartES duruş adı sabit "Eşlenmemiş (SmartES)" nedeniyle (kod `SMARTES-ESLM`, pasif; yoksa açılır) yazılır. İş emri dışındaki duruş yazılmaz.
  Sınır: CORE üretim olayı yalnız eklenen defterdir; neden sonradan eşlenince yalnız SmartES izindeki neden düzelir, CORE'daki duruş olayı sabit nedende kalır
  (karar 8 tam uygulanamadı; kullanıcıya soruldu).
- Fire: red kaydı (`RejectsList`) okununca onay kuyruğuna "hurda" satırı olarak girer (`smartes_adet_onayi.red_id`). Onayda fire adının o anki eşlemesi uygulanır:
  `hurda` hurda sayımı, `sayim-duzeltme` ("Fazla M30") sağlamdan düşüş, `hatali` ("Rework") hatalı parça kaydı. Eşlenmemiş fire adı onaylanamaz. SetErpOkRed çağrılmaz.
- Alarm yalnız gösterilir; CORE'a yazılmaz.
- Göçler: `20261126135359_istasyonlar_makine_uretim_kaynagi` (makineye iki boş olabilen sütun) ve `20261126143203_smartes_hareket_aktarimi` (tür genişletme,
  `smartes_adet_onayi.red_id`, yeni `smartes_hareket`). Yalnız ekler; var olan veri değişmez.
- Yeni uçlar: `GET /smartes/gecis` (`sayfa.smartes`), `POST /smartes/gecis/degistir` ve `POST /smartes/hareketler/yeniden-dene` (`ayarlar.yaz`).
  Sözleşmede değişen: eşleme ve liste türlerine `kullanici`, fire sonucuna `sayim-duzeltme`, onay satırına `tur` ve `fireAdi`.
- 3655 ve 3658 bu yazıma katıldı; ikisi de main'de zaten yazılı ve testli olduğundan bu yamada ek değişiklik yok.
- BİLMİYORUM: canlı SmartES'te ACTIVITY alan adı ve değerleri, `UsersList` alanları ve iş emri satırındaki kullanıcı alanı. Aday adlar `kurallar.ts` `ALANLAR`'da;
  ilk canlı okumada doğrulanmalı.
- Risk düzeltmeleri (26.11): bekleyen fire satırı listede onayın yazacağı türü (fire adının şimdiki eşlemesi) gösterir; ekran gördüğü türü onayla
  gönderir, tutmazsa onay çakışmayla döner. Toplu onayda sayım düzeltmesi varsa "N satır sağlamdan düşer, toplam −X" penceresi açılır. Sayım düzeltme
  yetkisi olanın eksi sayımı SmartES kilidine takılmaz (SmartES makinesinde CORE'daki tek düzeltme yolu). Makineleri farklı kaynaktan üreten istasyonda
  eşlenmemiş makine kodlu satır aktarılmaz (çift sayım). Hareket durumu "yazıldı" satırın üstüne yazılmaz. Geçiş tablosu kayıt kipinde (geniş ekranda kayar).
- Arayüz düzeltmesi (26.11): terminal kilidi yeni React terminalinde (`istemci/src/moduller/arkon/yeni/operator/Operator.tsx`): işin üretimi SmartES'ten
  geliyorsa şerit nedeni yazar, durum düğmeleri ve telefon eylem çubuğu kapalıdır, SmartES makinesi makine seçiminde kilitlidir. Eski `arkon/web` terminalindeki
  aynı değişiklik yalnız testlerde kullanılır.
- Karar 8 a (26.11, Soru Merkezi): duruş adı sonradan eşlenince CORE'daki duruş olayına düzeltme kaydı yazılır (uretim-emirleri
  `uretim_olayi_duzeltmesi`, yalnız eklenir; olay değişmez). Raporlar ve emir akışı olayı `uretim_olayi_gecerli` görünümünden okur (en son düzeltme geçerli).
  SmartES izi yazdığı duruş olayını tutar (`smartes_hareket.olay_id`). Göçler `20261126172611_uretim_emirleri_olay_duzeltmesi`, `20261126172612_smartes_hareket_olay`.
  Kişi düzeltmesi tabloda ve görünümde hazır, ama henüz yazan akış yok: yanlış kişi eşlemesinde geçmişi düzeltmek ayrı adımdır; başlat ve bitir kayıtları
  (uretim_kaydi, makine kullanımı) bu düzeltmenin dışındadır.
