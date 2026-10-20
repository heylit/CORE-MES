# UYUM BORCU: smartes (kart #778)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

## Bağlamada kapanacak
1. Ortam değişkenini çekirdek okur / modül `process.env`'den `TMIV2_SMARTES_*` okur / `baglanti.ts` / CEKIRDEK-ISTEKLERI 3.
2. KAPANDI (borç 405): İş transaction'ı uzak servisi beklemez. İşler `txDisi` biçiminde (`isler.ts`); tur okuma ya da niyeti kısa transaction'da yazar, isteği
   transaction dışında atar, sonucu ayrı kısa transaction'da yazar (`servis.ts` `turBasi`, `sonucYaz`). Sonuç yazılamazsa süreç belleğinde bekler, akışın sonraki
   turunda istekten önce yazılır (istek yinelenmez). Boşta transaction kesmesi uzatması kaldırıldı. Testler: `smartes.test.ts` "borç 405" (DOĞRULANDI).
3. Yetki / eşleme yazma yalnız yönetici, okuma `sayfa.smartes` / `uclar.ts` / rol ataması ortak yetki matrisinden (Aşama 2).
4. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): bağlantı kodu kapsam dışı; WSDL doğrulama adımı `kurulum/smartes.md` madde 3'te.
   Eski metin: Alan adları ve parametreler canlı WSDL'den doğrulanmadı (VARSAYIM) / `kurallar.ts` `ALANLAR`, `okumaParametreleri`,
   `isEmriParametreleri` / ilk gerçek bağlantıda ham satır (`ham` sütunu) okunur, yalnız bu iki yer düzeltilir.
5. OperationCode = operasyon numarası (VARSAYIM) / operasyon tipi eşlemesi kullanılmıyor / `kurallar.ts` `smartesOperasyonKodu` /
   BASKA-MODUL-ISTEKLERI 2 gelince eşlemeden okunur.
6. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): IsErp adımı `kurulum/smartes.md` madde 1'de (geçiş günü kontrolü).
   Eski metin: Logo–SmartES eski bağlantısı ile IsErp çakışması (BİLMİYORUM) / tek anahtar okuma ile işareti birlikte açar / `smartes.baglanti` /
   geçiş günü kullanıcı anahtarı açar; gerekirse işaret ayrı anahtara ayrılır (kullanıcı kararı).
7. Okunan sayılar üretim kaydına aktarılmıyor / yalnız smartes tablolarında / BASKA-MODUL-ISTEKLERI 3.
8. `smartes_giden.is_emri_id` ve `smartes_esleme.tmi_id` yabancı anahtar taşımaz / Aşama 1 kuralı / Aşama 2'de ayrı göçle.
10. Kalite, hurda, ambar verisi stok ve kalite kaydına işlenmiyor, SmartES'te "aktarıldı" işaretlenmiyor / yalnız `smartes_red`, `smartes_ambar_hareketi`,
    `smartes_kalite_kontrol` tablolarında / bağlamada sahibi modül belirlenir (stok, kalite); işaretleme ayrı kullanıcı kararı.
11. Metot, parametre ve satır alan adları SmartFactory servis belgesinden (10.6.2.17) alındı, canlı WSDL'de doğrulanmadı / `kurallar.ts` `ALANLAR`,
    `KALITE_AMBAR_ALANLARI`, `okumaParametreleri`, `kaliteAmbarParametreleri`, `tanimParametreleri`, `operasyonParametreleri`, `isEmriParametreleri`,
    `TANIM_KOD_ALANLARI` / ilk gerçek bağlantıda ham satır (`ham` sütunu) ve WSDL okunur, yalnız bu yerler düzeltilir. Belge farkları 20.10.2026'da kapandı:
    duruş `DownTimeStatusListWithoutWorkOrder` (DownTimeList tanım listesidir), fire `WsWorkordersRejectStatusList` (RejectsList tanım listesidir),
    alarm makine başına (`ActiveMachinesList` + `AlarmsList` `MachineID`), ambar `StartDate/EndDate`, kalite `StartDateTime/EndDateTime`,
    istasyon ve operasyon `ID/Code/Name`, `WorkStationList` satırında `CODE`, iş emrinde `Multipler` ve `QuantityUpdate`.
12. Tanım gönderiminin sonucu kod eşlemesine yazılmıyor / `smartes_tanim_giden`; `smartes_esleme` kişi ister ve `malzeme` türü yok / eşleme ekranından elle,
    ya da bağlamada eşleme türü eklenip sistem yazımı (kullanıcı kararı).
13. Tanım gönderimi `GEREKLI_METOTLAR` dışındadır / `ISTEGE_BAGLI_METOTLAR` yalnız bildirilir / canlı WSDL doğrulanınca gerekli listeye alınıp alınmayacağı kararlanır.
14. Stok kaynağı kart türü süzgeci (hammadde, yarı mamul, mamul; yalnız `aktif` kart) VARSAYIM / `tanim-kaynagi.ts` / kullanıcı kararıyla genişletilir.
15. Tanım gönderiminde niyet bir tur önce yazılır; süreç niyet ile gönderim arasında yeniden başlarsa kayıt `belirsiz` olur (yanlış alarm, çift gönderim değil) /
    `smartes_tanim_giden` / SmartES'te kontrol edilip elle temizlenir (arayüz yok).

16. Belgede tanımı olmayanlar (VARSAYIM; SmartES firmasına sorulur) / `kurallar.ts` / cevap gelince yalnız ilgili satır değişir:
    a) KAPANDI (kullanıcı 20.10.2026): `IsErpOK` / `IsErpRED` OK ve RED adedinin ERP'ye aktarıldı işaretidir, yalnız ERP tarafı yazar; belgedeki
       "alınmadı ise true" belge hatası (WSDL imzası `SetErpOkRed(WorkOrderStatusID, IsErpOK, IsErpRED)`).
    b) Yazma metotlarında `ID` "Bkz. ID*" tanımsız; 0 yeni kayıt ya da koda göre var olan kayıt sayıldı (istasyon, operasyon).
    c) Fire ve kalite filtresinin değerleri sayılmaz; `All` gönderilir (iş emri ve ambar filtresindeki ad).
    d) İstasyonda günlük kapasite tipi 1 (elle giriş), değer 0 gider.
    e) `WorkStationList` ve `StocksList` süzgeç parametreleri (kod, ad) gönderilmez: boşken tüm liste döndüğü varsayıldı.
    f) `QuantityUpdate` yalnız adet önceki gönderimden farklıysa true; ayrı `WorkOrdersQuantityUpdate` metodu kullanılmıyor.
    g) KAPANDI (kullanıcı 20.10.2026): SOAP 1.1 ASMX, ad alanı `http://tempuri.org/`, `SOAPAction` tırnaklı, kimlik doğrulama yok, tarih
       `yyyy-MM-ddTHH:mm:ss` (Z'siz). Adres yalnız `TMIV2_SMARTES_ADRESI`'nde, depoya girmez. Açık: üretim adresi ve kimlik doğrulaması değişecek mi
       (firmaya soruldu).
17. İş emrine bağlı duruş okunmuyor / WSDL'de ayrı metot yok (kullanıcı 20.10.2026), yalnız iş emrisiz duruş okunur / `OKUMA_METOTLARI.durus` /
    dolaylı yollar `ActiveModeList` ile `DownTimeStatusListWithoutWorkOrder` makine ve zaman kesişimi; firmaya soruldu (CustomReport, OEEReport,
    salt okunur SQL). Duruş satırının alan adları (`DOWNTIME_NAME`) WSDL şemasından doğrulanacak.
18. Alarm satırında kimlik yok: kayıt makine kimliği, alarm tipi, alarm no ve başlangıçtan türetilen kimlikle tekildir (`alarmKimligi`, SHA-256'nın
    ilk 52 biti); şema değişmedi. Her alarm turunda makine sayısı kadar istek gider; bir makinenin okuması düşerse pencerenin tamamı yeniden okunur.

19. Özet içeriği değişti (`Multipler`, stok açıklaması 150): bağlantı açılınca daha önce gönderilmiş her iş emri bir kez yeniden gider (zararsız
    güncelleme). Bugün bağlantı hiç açılmadı (VARSAYIM).
20. KAPANDI (#2141): `kurulum/smartes.md` madde 3 ve 4 belgedeki metot adlarıyla güncellendi.

21. Parametre adlarının harfi / kullanıcının WSDL'inde `WorkOrderStatusID`, `WorkOrderStatusFilter`; kodda `Workorder...` (`kurallar.ts:263`, `:276`).
    ASMX öğe adları büyük-küçük harfe duyarlı sayıldı (VARSAYIM): yanlış ad sessizce yok sayılır / WSDL dosyası gelince bütün adlar doğrulanır,
    düzeltme yalnız `kurallar.ts`.
22. KAPANDI (346 a, 20.10): `IsErp` işaretini başka bir program koyar ve koymaya devam eder; TMI hiç işaretlemez (`smartes-isaret` işi ve `SetErpOkRed` çağrısı kaldırıldı,
    metot `YASAK_METOT_KALIBI`'nda kalır). `smartes_is_emri_durumu.isaret_*` sütunları göçsüz yerinde durur, kullanılmaz.

## Sonra
9. Okuma penceresi ve aralıklar (5/15 dk, 24 saat üst sınır, 15 dk örtüşme) VARSAYIM; gerçek hacimle ayarlanır.
