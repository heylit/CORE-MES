# Kural -> test: smartes (kart #778)

Testlerde gerçek ağ çağrısı yok: SmartES `sahte-smartes.ts` (127.0.0.1); akış testleri gerçek PostgreSQL ile.

| Kural | Test |
|---|---|
| SME-1 adres yoksa bağlantı kapalı; bozuk, kimlik ya da sorgu taşıyan adres açılışı durdurur, ileti değer taşımaz | `soap.test.ts` `SME-1 ...` (3 test) |
| SME-2 yalnız kurum içi adres (ADR 0013) | `soap.test.ts` `SME-2 ...` |
| SME-3 zarf: ad alanı, tırnaklı SOAPAction, sıralı ve kaçırılmış parametre; ad enjeksiyonu ve sonsuz sayı reddedilir | `soap.test.ts` `SME-3 ...` (2 test) |
| SME-4 tarih ofsetsiz SmartES saatiyle (Europe/Istanbul) | `soap.test.ts` `SME-4 ...` |
| SME-5 XML okuyucu; DTD, tanımsız varlık, kaçırılmamış & reddedilir | `soap.test.ts` `SME-5 ...` (2 test) |
| SME-6 skaler sonuç; AffectedRows=0 ve boş hata başarıdır; Fault ve bozuk cevap ayrılır | `soap.test.ts` `SME-6 ...` (2 test) |
| SME-7 diffgram satırları; bozuk sayı null (sıfır uydurulmaz) | `soap.test.ts` `SME-7 ...` (2 test) |
| SME-8 istemci başlık ve parametreleri gönderir, sonucu okur | `istemci.test.ts` `SME-8 ...` (2 test) |
| SME-9 yineleme: Fault ve 404 yinelenmez; zaman aşımı 1-3-9 sn; yazma zaman aşımında yinelenmez; kopan bağlantı ve 503 bir kez | `istemci.test.ts` `SME-9 ...` (5 test) |
| SME-10 ulaşılamayan adres sabit ileti, adres iletide yok | `istemci.test.ts` `SME-10 ...` |
| SME-11 okuma penceresi örtüşmeli; hata pencereyi ilerletmez, neden saklanır | `smartes.test.ts` `SME-11, SME-12 ...`, `SME-11 (ret) ...` |
| SME-12 kayıt SmartES kimliğiyle bir kez; kimliksiz satır sayılır; ham satır saklanır | `smartes.test.ts` `SME-11, SME-12 ...`, `SME-12 ...` |
| SME-13 (346 a) TMI "ERP'ye aktarıldı" işaretini hiç koymaz: hiçbir tur `SetErpOkRed` çağırmaz, `smartes-isaret` işi yok, `yasakMetotMu('SetErpOkRed')` true | `smartes.test.ts` `SME-13 (346 a) ...`, `SME-16 ...`, `hazirlik.test.ts`, `kalite-ambar.test.ts` `SME-20 yasak metot kuralı` |
| SME-14 eşlemeli istasyondaki planlı emir gider; değişmeyen yeniden gitmez; ret bekleme yazar; ağ hatası turu durdurur | `smartes.test.ts` `SME-14, SME-15 ...`, `SME-14 (ret) ...` |
| SME-15 plandan düşen emir pasif (iptal) ya da bitti olur; silme metodu çağrılmaz | `smartes.test.ts` `SME-14, SME-15 ...` |
| SME-16 anahtar kapalı ya da adres yokken istek ve yazma yok; iş "bekliyor" nedeniyle biter | `smartes.test.ts` `SME-16 ...` (2 test) |
| SME-17 eşleme yazma yalnız `smartes.esleme-yaz`; kod türde tekil; sürüm denetimi; okuyucu okur | `smartes.test.ts` `SME-17 ...` |
| SME-18 durum, listeler, menü sayaçları `sayfa.smartes` ile | `smartes.test.ts` `SME-18 ...` |
| SME-19 hatada pencere yarıya iner (en az 5 dk), her başarılı okuma ilerler; asgari pencerede süren bozuk cevap pencereyi atlatır ve hata metninde görünür, ağ/zaman aşımı/SmartES hatası atlatmaz; yasak karakter başvurusu U+FFFD olur; yazılamayan satır turu düşürmez (KD-044) | `kurallar.test.ts` `SME-19 ...` (4 test), `smartes.test.ts` `SME-19 ...` (3 test), `soap.test.ts` `SME-5: yasak karakter ...` | görüldü: küçültme kaldırılınca 3 test kırmızı |
| SME-H1 akış durumu: kodda yok / bağlanmadı / adres eksik / anahtar kapalı / hazır | `hazirlik.test.ts` `SME-H1` |
| SME-H2 canlı deneme yalnız `?WSDL` ve son bir saatin `WorkOrdersStatusList` okuması; okunan kaydedilmez, işaretlenmez; ağ hatasında liste atlanır | `hazirlik.test.ts` `SME-H2` (5 test) |
| Ekran: kapalı ve adressiz durum açıklaması, yazma yetkisi, 409 iletisi, boş hücre sıfır değil | `istemci/src/moduller/smartes/smartes.test.tsx` (8 test) |
| SME-20 kalite/hurda/ambar okuması: akış anahtarı (`smartes.kalite-ambar-okumasi`, varsayılan kapalı), ana anahtar ve adres yokken istek ve yazma yok; açıkken doğru metot, Z'siz pencere ve tırnaklı SOAPAction; kayıt SmartES kimliğiyle tekil ve güncellenir; işaretleme, yazma ve silme metodu çağrılmaz; ağ ve SmartES hatasında tur düşmez, imleç ilerlemez, kaynaklar birbirini etkilemez. Alan ve parametre adları VARSAYIM | `kalite-ambar.test.ts` `SME-20 ...` (7 test, işler dahil), `kurallar.test.ts` `Kalite, hurda, ambar satır eşleme` |
| SME-21 tanım gönderimi: anahtar (`smartes.tanim-gonderimi`, varsayılan kapalı), ana anahtar ve adres yokken istek yok; önce niyet (istek yok), sonraki turda SmartES listesi okunur ve yalnız kodu olmayan kayıt gider; kod eşlemeli istasyon ve SmartES'te var olan kod gönderilmez; sonucu bilinmeyen gönderim ve taze olmayan niyet `belirsiz` kalır, yinelenmez; ret bekleme süresiyle yeniden denenir; liste okunamazsa ya da kod alanı bulunamazsa hiçbir şey gitmez; tur sınırı; uygunsuz kod atlanır; istasyon kaynağı `istasyonlar/disari.ts`'ten okunur. Parametre ve liste alan adları VARSAYIM | `kalite-ambar.test.ts` `SME-21 ...` (9 test), `kurallar.test.ts` `Tanım gönderimi kuralları` (5 test) |
| SME-H1 (genişletildi) akış kendi anahtarı kapalıysa durum `kapali`; hazırlık yeni akışların sayısını, son denemesini ve ilk hatasını gösterir; `uretim-kaydi` `baglanmadi` kalır | `kurallar.test.ts` `Tanım gönderimi kuralları`, `kalite-ambar.test.ts` `hazırlık ...` |
| SME-H2 (genişletildi) isteğe bağlı (yeni akış) metotları WSDL'de yoksa yalnız bildirilir, kontrol kırmızı olmaz; `GEREKLI_METOTLAR` değişmedi | `hazirlik.test.ts` `isteğe bağlı metotlar ...` |
| SME-22 belge uyumu (SmartFactory 10.6.2.17): duruş `DownTimeStatusListWithoutWorkOrder` büyük harfli parametrelerle; alarm makine başına (`ActiveMachinesList`, `MachineID`), kimlik makine + alarm no + başlangıçtan, bitiş güncellenir, bir makine düşerse pencere ilerlemez; fire `WsWorkordersRejectStatusList`, ambar `StartDate/EndDate`, kalite `StartDateTime/EndDateTime`, filtre `All`; istasyon ve operasyon `ID/Code/Name`, `WorkStationList` kodu `CODE`; iş emrinde `Multipler`, adet değişince `QuantityUpdate` true (özete girmez), kapanış belgedeki sırada | `smartes.test.ts` `SME-11 (ret)`, `SME-12 ...` (2 test), `SME-14, SME-15 ...`; `kalite-ambar.test.ts` `açıkken doğru metot ...`, `önce niyet yazılır ...`; `kurallar.test.ts` `Duruş ve alarm satır eşleme` (3 test), `İş emri gönderimi` (3 test); `hazirlik.test.ts` `WSDL metot adları ...` |

Kırmızı (mutasyon) bu turda ayrıca koşulmadı; testler kodla aynı turda yazıldı. SME-20 ve SME-21 için de geçerli.
