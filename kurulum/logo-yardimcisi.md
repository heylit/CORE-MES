# Logo yardımcısı kurulumu (kartlar #207, #210, #777; ADR 0017)

TMI Logo'ya, Logo istemcisiyle aynı bilgisayarda çalışan Logo yardımcısı üzerinden yazar (`araclar/logo-yardimcisi`). Yardımcı yalnız
`127.0.0.1`'i dinler, Logo'ya Logo Objects (COM) ile yazar, Logo veritabanını SQL ile yalnız okur. İstek ancak iki koşul birlikteyken çıkar:
Sistem Ayarları'nda "Logo bağlantısı" anahtarı açık (varsayılan kapalı) VE aşağıdaki iki ortam değişkeni tanımlı. Biri eksikse
kartlar "bekliyor" olarak birikir, hiçbir istek atılmaz, sunucu açılır. Anahtar açık ama değişken yoksa `/saglik/ayrinti`'de
`logo-malzeme-gonderimi` işi "Bekliyor" ve nedenini gösterir (anahtar kapalıyken de). Anahtarı açıp kapatmak denetim kaydına yazılır.

## TMI ortam değişkenleri

| Değişken | İçerik |
|---|---|
| `TMIV2_LOGO_KOPRU_ADRESI` | Yardımcının adresi, yalnız `http://127.0.0.1:<port>` (ya da `localhost`, `[::1]`). Sondaki `/` atılır. |
| `TMIV2_LOGO_KOPRU_ANAHTARI` | Yardımcının ayar dosyasındaki `anahtar`; her istekte `X-Api-Key` başlığıyla gider. |

İkisi birlikte verilir ya da hiçbiri. Biri eksik, adres bozuk ya da başka bilgisayarı gösteriyorsa sunucu açılmaz ve hangi değişkenin hatalı
olduğunu söyler. Değerler `.env` dosyasına (depoya girmez) ya da sunucu servisinin ortamına yazılır; depoya, karta, belgeye girmez.

## Yardımcıyı derleme

Logo bilgisayarında .NET Framework 4.x olmalı (Logo istemcisi de ister). Paket ve internet gerekmez; yönetici yetkisi gerekmez.

```
araclar\logo-yardimcisi\derle.cmd test
```

Çıktı `araclar\logo-yardimcisi\cikti\logo-yardimcisi.exe` (x86) ve `testler.exe`; `test` verilirse sahte Logo testleri koşar
(son satır `# gecen N, kalan 0`). Logo Objects 32-bit olduğu için yardımcı x86 derlenir; 64-bit çalışırsa açılışta uyarı yazar.

## Yardımcının ayar dosyası

`araclar\logo-yardimcisi\ornek.ayar`'ı depo dışına (ör. kullanıcının belgeler klasörü) kopyalayın, yer tutucuları doldurun. Dosya yalnız
o Windows kullanıcısınca okunabilir olmalı; içinde Logo parolası ve SQL bağlantısı vardır, depoya, karta ve mesaja girmez.

| Anahtar | İçerik |
|---|---|
| `port` | 1024-65535; yalnız 127.0.0.1'de dinlenir. TMI'deki adresin portu. |
| `anahtar` | En az 16 karakter; TMI'deki `TMIV2_LOGO_KOPRU_ANAHTARI` ile aynı. |
| `logo_kullanici`, `logo_parola` | Logo Objects `UserLogin` için. |
| `firma_no`, `donem_no` | `CompanyLogin` ve tablo adları (`LG_<firma>_...`, `LG_<firma>_<dönem>_...`) için. |
| `sql_baglanti` | Logo veritabanına salt okunur bağlantı. Yalnız `db_datareader` yetkili ayrı SQL kullanıcısı önerilir. |
| `ambar_no`, `isyeri_no` | İsteğe bağlı, varsayılan 0. |
| `deneme_satici`, `deneme_alici` | İsteğe bağlı, yalnız `--deneme` için test cari kodları. |
| `deneme_hedef_ambar` | İsteğe bağlı, yalnız `--deneme` için ambar fişinin hedef ambar no'su (kaynak `ambar_no`); yoksa ambar fişi denenmez. |

## Çalıştırma

```
cikti\logo-yardimcisi.exe --ayar <ayar dosyası>
```

Ayar yolu `TMIV2_LOGO_YARDIMCI_AYARI` ortam değişkeniyle de verilebilir. Yardımcı kullanıcı süreci olarak çalışır (yönetici gerekmez);
oturum açılınca kendiliğinden başlaması için kullanıcının Görev Zamanlayıcı'sında "oturum açıldığında" görevi tanımlanabilir. Ctrl+C durdurur.

- Logo oturumu ilk istekte açılır ve açık kalır (tek oturum, tek iş parçacığı; istekler sırayla işlenir).
- Bağlantı kurulamazsa 5 dakika yeniden denenmez (Logo lisansı kapanan oturumu birkaç dakika tutar); bu sürede istekler 503 alır ve gönderilmemiş sayılır.
- Yazma sırasında oturum koparsa cevap 500'dür; TMI bunu "sonucu bilinmiyor" sayar ve önce "var mı" ile okur.
- Tarayıcıdan gelen istek (`Origin` başlığı) ve yabancı `Host` reddedilir. Günlüğe istek gövdesi, parola ve anahtar yazılmaz.

## Yardımcının kuralları

- Logo tablolarına SQL ile yazılmaz. Sorgular tek yerde (`SqlOkuma.cs` `Sorgular`) ve yalnız `SELECT`'tir; başka her metni reddeden denetim
  ve her sorgunun geri alınan transaction'da koşması ikinci ve üçüncü kalkandır.
- Yazma Logo Objects ile: malzeme, satın alma siparişi, talep fişi, malzeme fişi XML `ImportFromXmlStr` + `Post`; satış teklifi, tekliften satış
  siparişi ve talep karşılama `New()` + `FieldByName`. Güncelleme `Read` + değişiklik + `Post` (XML `UPD` kullanılmaz).
- Her yazmadan sonra kayıt SQL ile okunup doğrulanır; tutmazsa cevap `success: false` ve "Logo'ya yazıldı ama SQL doğrulaması tutmadı" olur.
- İrsaliye ve fatura yazılmaz, yalnız okunur (e-irsaliye ve e-fatura Logo Connect'ten gelir).
- Rehberin tuzak maddeleri kodda ve testte: siparişte `DISCPER` yok (iskonto fiyata yedirilir), `SOURCE_WH`/`DIVISION`, kapatma `ORDER_CLOSED`,
  teklifte `ALTNR` ve `OFFER_REFERENCE` yazılmaz, karşılama yalnız onaylı talep fişine, karşılama kaldırmada önce `MEET_AMNT` 0, birim seti kodla.
- Ölçülmemiş etiket yazılmaz: Açıklama 1 alanı ölçülene kadar istekte gelirse kayıt yazılmadan reddedilir; sabit kıymet (kart türü 4) da öyle.

## Ölçüm (`--olc`)

Yeni bir alan ya da belge türüne yazmadan önce Logo'daki gerçek bir kaydın dökümü alınır; yardımcı yalnız okur, çıktı ekrana yazılır:

```
cikti\logo-yardimcisi.exe --ayar <ayar dosyası> --olc malzeme <malzeme kodu>
cikti\logo-yardimcisi.exe --ayar <ayar dosyası> --olc satin-alma-siparisi <logicalRef>
```

Türler: malzeme, malzeme-fisi, alinan-hizmet, verilen-hizmet, satin-alma-siparisi, talep-fisi, karsilama, satis-siparisi, satis-teklifi.
Çıktıda gerçek veri vardır; depoya ve karta yapıştırılmaz, yalnız etiket adı ve değer türü aktarılır.

## Canlı deneme (`--deneme`)

```
cikti\logo-yardimcisi.exe --ayar <ayar dosyası> --deneme
```

Önce Logo'da `TMI-ERP-TEST-001` test malzemesi elle açılır (deneme açmaz, silmez) ve ayara `deneme_satici` (gerekirse `deneme_alici`) yazılır.
Deneme bütün yazma akışlarını uçtan uca dener: malzeme var mı, satın alma siparişi aç, düzenle, satır kapat, onaylı talep fişi, karşılama yaz, oku,
kaldır, sipariş iptal, malzeme fişleri (üretimden giriş, sarf, fire, sayım fazlası, sayım eksiği; `deneme_hedef_ambar` varsa ambar),
satış teklifi ve tekliften satış siparişi. Fiş numaraları `TMI-ERP-` öneklidir; sonunda
yalnız bu koşuda açılan ve numarası SQL'den yeniden okunup önekle başladığı doğrulanan kayıtlar silinir. Gerçek kayıt silinmez. Her satır
`TAMAM` ya da `HATA` yazar; son satır hata sayısıdır.

## Birim seti listesi ve KDV

- İzinli birim seti kodları yardımcının listesinden saatte bir okunur; yönetici `POST /api/logo/birim-setleri/ekle` ile elle de ekler.
  Liste hiç okunmadıysa elle girilen geçerlidir; okunduysa yalnız Logo listesindeki. Listede olmayan birim karşılığıyla kart gönderilmez,
  "Geçersiz karşılık" hatası alır.
- KDV oranı Sistem Ayarları'nda "Logo KDV oranı (%)" ayarıdır, varsayılan 20; kart alış ve satış KDV'si (`vat`, `sellVat`) bu oranla açılır.
- Hizmet kartının oranı ayrı ayardır ("Logo: hizmet KDV oranı (%)"), varsayılan boş; boşken `VAT_PERC` gönderilmez. Her iki oran boşaltılabilir.

## Satın alma (kart #777)

- Sistem Ayarları'nda ayrı anahtar: "Logo: satın alma gönderimi" (`logo.satin-alma-gonderimi`, varsayılan kapalı). İstek ancak bu anahtar,
  "Logo bağlantısı" ve iki ortam değişkeni birlikteyken çıkar. İş (`logo-satin-alma-gonderimi`) satın alma modülünün kuyruk işlevleri gelince açılır.
- Sipariş "siparis_verildi" olunca kendiliğinden gider. Sıra: numarayla bulma (`GET /api/PurchaseOrder/find/{no}`), varsa satırları okunup bağlanır
  (`/{no}/lines`), yeni sipariş açılmaz; yoksa cari denetimi (`GET /api/Arp/find/{kod}`), sonra `POST /api/PurchaseOrder/AddRich`.
- Numara TMI'nin sipariş numarasıdır (SP-yıl-sıra, en çok 16 karakter). Cari kodu finans firma kartındaki "Logo cari kodu"dur; boşsa sipariş gitmez.
- İskonto Logo'da ayrı alan değildir: birim fiyata yedirilir, satır açıklamasına "(isk. %n)" yazılır. Nakliye ve diğer masraf Logo'ya gitmez.
- Düzenleme `POST /api/PurchaseOrder/UpdateRich` (Read+Modify+Post); kapatma `POST /{no}/close {lineRefs}`; iptal önce talep karşılamasını kaldırır
  (`DELETE /api/DemandFiche/peg/byOrder/{ref}`), sonra `POST /{no}/cancel` (Logo'da fiş silinmez, iptal görünür).
- Onaylı talep Logo talep fişi olur (`POST /api/DemandFiche/AddRich`, onaylı açılır); siparişe bağlanan talep kalemi karşılama olur
  (`POST /api/DemandFiche/peg`, önce `GET peg/byOrder/{ref}` ile okunur). Talep fişini numarayla bulma ucu yok (TMI tarafında): sonucu bilinmeyen gönderim
  kendiliğinden yinelenmez, "Logo'da kontrol edin" hatası görünür.

## Satış teklifi ve siparişi (portal, kart #777)

- Sistem Ayarları'nda ayrı anahtar: "Logo: satış gönderimi" (`logo.satis-gonderimi`, varsayılan kapalı). İş (`logo-satis-gonderimi`) her turda koşar; anahtar kapalıyken istek atmaz. Teklif, portalda müşteriye gönderilince; sipariş, müşteri kabulü bizden onaylanınca aynı tekliften gider.
- Teklif `POST /api/SalesOffer/AddRich` ile açılır. Firmanın Logo cari kodu CRM satış müşterisi olarak da tanımlı olmalı; değilse teklif gitmez
  ve "satış müşterisi (CRM) olarak tanımlı değil" hatası görünür. Satış siparişi yalnız tekliften açılır (`POST /api/SalesOffer/{ref}/toOrder`).
- Teklif ve satış siparişini numarayla bulma ucu yok: sonucu bilinmeyen gönderim yinelenmez, "Logo'da kontrol edin" hatası görünür.

## Kart güncelleme ve hizmet kartı (kart #777)

- Logo'ya gitmiş malzeme kartının adı değişince `POST /api/Material/UpdateRich` gider (hizmet kartı kendi yönünün `UpdateRich` ucuna). Kod, tür ve birim değişmez.
- Hizmet kartı gönderimi Sistem Ayarları'nda yön başına ayrı anahtardır ("Logo: alınan hizmet kartı gönderimi", "Logo: verilen hizmet kartı gönderimi"),
  kapalı gelir. Hizmet "var mı" ucu yardımcıda vardır (`GET /api/PurchaseService|SalesService/exists/{kod}`); sonucu bilinmeyen gönderim
  önce bununla okunur. Açmadan önce deneme firmasında bir kartla deneyin.

## Malzeme fişi

- Açma `POST /api/MaterialSlip/Add{Tür}`; numarayla bulma `GET /api/MaterialSlip/{Tür}/find/{no}` (SQL, `STFICHE` FICHENO + TRCODE), yoksa 404;
  silme `DELETE /api/MaterialSlip/{Tür}/{no}` (Logo Objects `Delete`), sonra fişin SQL'den gittiği doğrulanır, yoksa 404.
- Türler ve TRCODE: `Consumption` sarf 12, `ProductionEntry` üretimden giriş 13, `Scrap` fire 11, `WarehouseTransfer` ambar fişi 25,
  `CountSurplus` sayım fazlası 50, `CountShortage` sayım eksiği 51. Gövdedeki `TYPE` uçla aynı olmalı; aynı türde aynı numara ikinci kez açılmaz.
- Numara TMI stok fişinin numarasıdır (emir fişinde emir no; ötekilerde `SF-`, `SE-`, `AF-`). TMI fiş değişince silip aynı numarayla yeniden açar
  (Logo'da satır silme yok), boşalınca siler.
- Ambar fişi başlıkta ve her satırda `SOURCE_WH` (kaynak) ve `DEST_WH` (hedef) Logo ambar no'su taşır; satırdaki çift başlıktakiyle aynı, kaynak ve
  hedef farklı olmalı. Öbür türlerde bu iki alan reddedilir.
- DOĞRULANMADI: TRCODE'lar (özellikle 11, 25, 50, 51) ve ambar fişinin `SOURCE_WH`/`DEST_WH` alan adları gerçek Logo'da denenmedi. TMI'de bu dört türün gönderim
  ayarı kapalı gelir (Sistem Ayarları, "Logo: ... fişi gönderimi"). Açmadan önce deneme firmasında `--deneme` koşun: dört tür de denenir; ambar fişi
  için ayar dosyasına `deneme_hedef_ambar` yazın (kaynak `ambar_no`). Logo'da açılan fişin türünü ve ambarlarını gözle denetleyin.

## Gerçek Logo'ya geçmeden önce

1. Yardımcıyı derleyin, `test` ile sahte Logo testlerinin geçtiğini görün.
2. Deneme firmasında `--deneme` koşun; bütün satırlar `TAMAM` olmalı. `HATA` satırını (gerçek veri olmadan) bildirin.
3. Açıklama 1'i yazmak gerekiyorsa `--olc malzeme <kod>` dökümünden etiketini bildirin; ölçülene kadar gönderilmez.
4. Logo gönderimi sayfasında tür ve birim karşılıklarını doldurun; eksik karşılıklı kart gönderilmez.
5. Yardımcıyı çalıştırın, TMI'ye iki değişkeni verin, sunucuyu yeniden başlatın; tek kartı aktif yapıp Logo gönderimi sayfasında "gonderildi"
   ile kayıt numarasını görün; Logo'da kartı açıp kodu, adı, türü, birim setini ve özel kodu (TMI) denetleyin.
6. İş durumu `/saglik/ayrinti` ucunda görünür (`logo-malzeme-gonderimi`): son tur, sonuç, hata özeti.
7. En son Sistem Ayarları'nda "Logo bağlantısı" anahtarını açın; denemeyi durdurmak için kapatın (sunucuyu yeniden başlatmak gerekmez).

## Gerçek Logo'da denenecek varsayımlar

Yardımcı rehberin ölçülmüş etiket ve alan listesiyle yazıldı ve sahte Logo ile sınandı; gerçek Logo'da hiçbir yazma denenmedi. Şunlar `--deneme`
ile doğrulanır; fark çıkarsa yalnız yardımcı değişir:

1. Rehberin veri sözlüğünde geçmeyen sütunlar (`SqlOkuma.cs` `Sorgular.Dogrulanmadi`): hizmet kartı türü (`SRVCARD.CARDTYPE` 1 alınan, 2 verilen),
   `STLINE` satır sütunları, talep satırını `LOGICALREF` ile okuma, satış teklifi başlık ve satır sütunları.
2. Dövizli satın alma siparişinde `CURRSEL_TOTAL` 1 kalır.
3. Talep fişi satırlarında `INTERNAL_REFERENCE` okunabilir (satır eşleme ve karşılama için).
4. Malzeme XML'indeki `FACTORY_PARAMS` bloğu rehberin ölçülmüş örneğinden alındı.
5. Logo bilgisayarında .NET Framework 4.x kurulu; yardımcı yönetici olmadan kullanıcı süreci olarak çalışır.
6. Malzeme fişi TRCODE'ları (sarf 12, giriş 13, fire 11, ambar 25, sayım fazlası 50, sayım eksiği 51) ve ambar fişinin `SOURCE_WH`/`DEST_WH` alanları.
7. Malzeme fişi Logo Objects `Delete` ile silinir ve aynı numarayla yeniden açılabilir; fişe bağlı kayıt (maliyet dağıtımı, kapanmış dönem) varsa silme reddedilir ve TMI satırı "reddedildi" olur.

TMI tarafındaki eski varsayımlar (cevap zarfı, 60 saniye, 5 dakika bekleme, kart türleri, sipariş alanları) yardımcının sözleşmesiyle aynıdır;
yardımcı bunları `kopru.ts`'in beklediği biçimde döner (`Islemler.cs`).

## Yerel deneme (sahte köprü)

Logo'suz yerel deneme için TMI'nin sahte köprüsü kullanılır; yalnız 127.0.0.1'de dinler:

```
node sunucu/moduller/logo/sahte-kopru-calistir.ts 4190 deneme-anahtari
```

Sonra `.env`'ye `TMIV2_LOGO_KOPRU_ADRESI=http://127.0.0.1:4190` ve `TMIV2_LOGO_KOPRU_ANAHTARI=deneme-anahtari` yazıp sunucuyu açın.
Senaryolar (başarı, doğrulama hatası, kod zaten var, zaman aşımı, 401, yavaş cevap, cevabın kaybolması) testlerde kullanılır
(`sunucu/moduller/logo/logo.test.ts`).
