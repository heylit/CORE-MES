# Logo köprüsü kurulumu (kartlar #207, #210, #777; ADR 0011)

Sunucu Logo'ya yalnız kurum içindeki köprü servisi üzerinden malzeme kartı ve satın alma siparişi (açma, iptal) yazar. İstek ancak iki koşul birlikteyken çıkar:
Sistem Ayarları'nda "Logo bağlantısı" anahtarı açık (varsayılan kapalı) VE aşağıdaki iki ortam değişkeni tanımlı. Biri eksikse
kartlar "bekliyor" olarak birikir, hiçbir istek atılmaz, sunucu açılır. Anahtar açık ama değişken yoksa `/saglik/ayrinti`'de
`logo-malzeme-gonderimi` işi "Bekliyor" ve nedenini gösterir (anahtar kapalıyken de). Anahtarı açıp kapatmak denetim kaydına yazılır.

## Ortam değişkenleri

| Değişken | İçerik |
|---|---|
| `TMIV2_LOGO_KOPRU_ADRESI` | Köprünün kök adresi, `http://` ya da `https://` ile; yalnız kurum içi (özel IP ya da tek parçalı sunucu adı). Sondaki `/` atılır. |
| `TMIV2_LOGO_KOPRU_ANAHTARI` | Köprü anahtarı; her istekte `X-Api-Key` başlığıyla gider. |

İkisi birlikte verilir ya da hiçbiri. Biri eksik, adres bozuk ya da kurum dışıysa sunucu açılmaz ve hangi değişkenin hatalı olduğunu söyler.
Değerler `.env` dosyasına (depoya girmez) ya da sunucu servisinin ortamına yazılır; depoya, karta, belgeye girmez.

## Birim seti listesi ve KDV

- İzinli birim seti kodları köprünün listesinden saatte bir okunur; yönetici `POST /api/logo/birim-setleri/ekle` ile elle de ekler.
  Liste hiç okunmadıysa elle girilen geçerlidir; okunduysa yalnız köprü listesindeki. Listede olmayan birim karşılığıyla kart gönderilmez,
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
  (`POST /api/DemandFiche/peg`, önce `GET peg/byOrder/{ref}` ile okunur). Talep fişini numarayla bulma ucu yok: sonucu bilinmeyen gönderim
  kendiliğinden yinelenmez, "Logo'da kontrol edin" hatası görünür.

## Satış teklifi ve siparişi (portal, kart #777)

- Sistem Ayarları'nda ayrı anahtar: "Logo: satış gönderimi" (`logo.satis-gonderimi`, varsayılan kapalı). İş (`logo-satis-gonderimi`) her turda koşar; anahtar kapalıyken istek atmaz. Teklif, portalda müşteriye gönderilince; sipariş, müşteri kabulü bizden onaylanınca aynı tekliften gider.
- Teklif `POST /api/SalesOffer/AddRich` ile açılır. Firmanın Logo cari kodu CRM satış müşterisi olarak da tanımlı olmalı; değilse teklif gitmez
  ve "satış müşterisi (CRM) olarak tanımlı değil" hatası görünür. Satış siparişi yalnız tekliften açılır (`POST /api/SalesOffer/{ref}/toOrder`).
- Teklif ve satış siparişini numarayla bulma ucu yok: sonucu bilinmeyen gönderim yinelenmez, "Logo'da kontrol edin" hatası görünür.

## Kart güncelleme ve hizmet kartı (kart #777)

- Logo'ya gitmiş malzeme kartının adı değişince `POST /api/Material/UpdateRich` gider (hizmet kartı kendi yönünün `UpdateRich` ucuna). Kod, tür ve birim değişmez.
- Hizmet kartı gönderimi Sistem Ayarları'nda yön başına ayrı anahtardır ("Logo: alınan hizmet kartı gönderimi", "Logo: verilen hizmet kartı gönderimi"),
  kapalı gelir. Hizmet için "var mı" ucu yok: sonucu bilinmeyen gönderim yinelenmez, "Logo'da kontrol edin" hatası görünür.
  Açmadan önce deneme firmasında bir kartla deneyin.

## Gerçek köprüye geçmeden önce

1. Köprü kılavuzundan şu üç biçimi doğrulayın ve sahte köprüden farklıysa bildirin (kod tek dosyada değişir: `sunucu/moduller/logo/kopru.ts`):
   "var mı" ucunun cevabı, birim seti listesi ucunun cevabı, `validate` alanının biçimi.
2. Logo'nun aynı stok koduyla ikinci kartı reddedip reddetmediğini öğrenin (kalkan buna güvenmez, ama bilinmesi iyi olur).
3. Logo gönderimi sayfasında tür ve birim karşılıklarını doldurun; eksik karşılıklı kart gönderilmez.
4. Köprü sunucusunun TMI sunucusundan erişilebildiğini (güvenlik duvarı, port) ve anahtarın bu sunucu için tanımlı olduğunu denetleyin.
5. Önce deneme firmasında / deneme veritabanında açın: değişkenleri verin, sunucuyu yeniden başlatın, tek kartı aktif yapın ve Logo gönderimi
   sayfasında "gonderildi" ile kayıt numarasını görün; Logo'da kartı açıp kodu, adı, türü, birim setini ve özel kodu (TMI) denetleyin.
6. İş durumu `/saglik/ayrinti` ucunda görünür (`logo-malzeme-gonderimi`): son tur, sonuç, hata özeti.
7. En son Sistem Ayarları'nda "Logo bağlantısı" anahtarını açın; denemeyi durdurmak için kapatın (sunucuyu yeniden başlatmak gerekmez).

## Köprü notuyla doğrulananlar (kullanıcının köprü notu, 05.10.2026; not depoya girmez)

DOĞRULANDI (not): cevap zarfı `{ success, logicalRef, method, error, validate }`, `logicalRef` Logo kayıt numarası (varsayım 3); `GET /api/Material/exists/{kod}`
ve `GET /api/Lookup/unitsets` uçlarının yolu; malzeme gövdesi `code, name, cardType, unitSetCode, vat, sellVat, auxilCode` (varsayım 6 ve 7'nin
alan adları); kart türleri 10 hammadde, 11 yarı mamul, 12 mamul, 13 tüketim, 4 sabit kıymet; kod en çok 24 karakter; Logo aynı kodla ikinci kaydı
"duplicate key" ile reddeder (varsayım 8, 15.09.2026 ölçümü); köprü tek oturumla sırayla işler, 60 saniye süre (varsayım 9); güncelleme yalnız
Read+Modify+Post ucuyla (XML `UPD` kullanılmaz); irsaliye ve fatura yazılmaz. Hizmet: alınan `PurchaseService`, verilen `SalesService` uçları var
(varsayım 14'ün yolu); hizmet "var mı" ucu notta da yok (varsayım 12 sürer). Firma: köprüde cari yazma ucu yok, yalnız `Arp/find`.
Hâlâ doğrulanmayan: "var mı" ve birim seti cevabının tam biçimi, `validate` biçimi (notta yalnız "liste").

## Gerçek köprüyle denenecek varsayımlar

Kod bunları sahte köprüyle varsaydı; gerçek denemede kullanıcıyla birlikte tek tek doğrulanır. Fark çıkarsa yalnız `kurallar.ts` ya da `kopru.ts` değişir.

1. "Var mı" ucu (`GET /api/Material/exists/{kod}`) zarf döner; kart varsa `logicalRef` > 0, yoksa 0 ya da boş. (Kılavuzda yok, doğrulanmadı.)
2. Birim seti listesi ucu `GET /api/Lookup/unitsets` adresindedir ve dizi (ya da zarfın `data` alanında dizi) döner; öğede kod `code`, `unitSetCode`
   ya da `CODE`, ad `name` ya da `NAME`. (Kılavuzda yok, doğrulanmadı.)
3. `AddRich` başarıda `success: true` ile yeni kartın `logicalRef`'ini döner; `success: false`'ta `error` ve `validate` (liste) dolu.
4. Doğrulama hatası 2xx ya da 4xx ile `success: false` gelir; 401/403 anahtar reddidir; 5xx, 408 ve 429 "sonucu bilinmiyor" sayılır.
5. Köprü kuyruğunda kalan bir istek en çok 5 dakikada biter (`BELIRSIZ_BEKLEME_MS`); sonra "var mı" onu görür.
6. `cardType` sayı (10, 11, 12, 13; 4 şimdilik gönderilmez), `unitSetCode` metin, `auxilCode` "TMI" olarak kabul edilir; kod en çok 24 karakter.
7. `vat` ve `sellVat` sayı (yüzde, örnek 20) olarak gider ve Logo bunu oran olarak kabul eder.
8. Logo aynı kodla ikinci kartı "duplicate key" ile reddeder (15.09.2026 ölçümü); kalkan buna güvenmez, yalnız son savunmadır.
9. Bir köprü isteği 60 saniyeyi aşmaz; aşarsa "belirsiz" sayılır ve 5 dakika sonra "var mı" ile sürer.
10. Köprü yönlendirme (3xx) yapmaz; yaparsa istek hata sayılır.
11. TMI sunucusunda (Windows servis) PostgreSQL "boşta transaction" süresi oturum içinde uzatılabilir; tur bu sürede transaction'ı açık tutar.
12. Hizmet kartı "var mı" ucu: kılavuzda yok (BİLMİYORUM). Köprü sahibine sorulur: hizmet kartı için exists ucu var mı, yoksa eklenebilir mi.
    Doğrulanmadan hizmet gönderimi açılmaz.
13. Hizmet `AddRich` gövdesinin JSON alan adları: kod geçici olarak XML etiketlerini gönderir (CODE, DESCRIPTION, CARD_TYPE, UNITSET_CODE, VAT_PERC,
    AUXIL_CODE; `kurallar.ts` `HIZMET_ALANLARI`). Doğrulanmadı.
14. Verilen hizmet yolu `/api/SalesService/AddRich` (VARSAYIM); alınan `/api/PurchaseService/AddRich` kılavuzda.
15. `CARD_TYPE` (alınan 1, verilen 2) ve `UNITSET_CODE` zorunlu mu; kod ikisini de gönderir.
16. Hizmet kodunun en çok uzunluğu (kod 24 varsayar).
17. Aynı kod Logo'da hem malzeme hem hizmet tablosunda olabilir mi (TMI'de stok kodu türler arasında tektir; "var mı" kartın kendi türüne sorar).

18. Sipariş gövdesinin JSON alan adları (`number, date, arpCode, orderStatus, currencyCode, rate, lines[].type, masterCode, quantity, price, vatRate,
    unitCode, dueDate, description`; `kurallar.ts` `SIPARIS_ALANLARI`): not yalnız XML etiketlerini veriyor, adlar satış teklifi ucundan varsayıldı.
19. `find/{no}` bulamayınca 404 ya da `logicalRef` 0 döner; `/{no}/lines` dizi (ya da zarfın `lines`/`data` alanı) döner, öğede `logicalRef` ve `lineNo`.
20. `Arp/find/{kod}` bulamayınca 404 ya da `logicalRef` 0 döner.
21. `UNIT_CODE` TMI biriminin büyük harfidir (adet -> ADET); ambar verilmezse Logo varsayılan ambarı kullanır; `ORDER_STATUS` 4 (sevk edilebilir).
22. `cancel` yinelenirse zararsızdır (iptal edilmiş siparişe yeniden iptal).

Siparişi açmadan önce deneme firmasında tek siparişle 18-22 denenir; fark çıkarsa yalnız `kurallar.ts` ya da `kopru.ts` değişir, sonra anahtar açılır.

Hizmet gönderimini açan çekme isteği, gerçek köprüyle yapılan denemenin sonucunu (hangi yol, örnek cevap biçimi; adres ve kimlik bilgisi olmadan) bu
belgeye yazar; deneme yapılmadan açan çekme isteği birleşmez.

## Yerel deneme (sahte köprü)

Sahte köprü yalnız test ve yerel deneme içindir; yalnız 127.0.0.1'de dinler:

```
node sunucu/moduller/logo/sahte-kopru-calistir.ts 4190 deneme-anahtari
```

Sonra `.env`'ye `TMIV2_LOGO_KOPRU_ADRESI=http://127.0.0.1:4190` ve `TMIV2_LOGO_KOPRU_ANAHTARI=deneme-anahtari` yazıp sunucuyu açın.
Senaryolar (başarı, doğrulama hatası, kod zaten var, zaman aşımı, 401, yavaş cevap, cevabın kaybolması) testlerde kullanılır
(`sunucu/moduller/logo/logo.test.ts`).
