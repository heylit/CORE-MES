# SmartES bağlantısı kurulumu (kart #778; ADR 0013)

Sunucu SmartFactory MES'in (SmartES) kurum içindeki SOAP servisine doğrudan bağlanır. İstek ancak iki koşul birlikteyken çıkar:
Sistem Ayarları'nda "SmartES bağlantısı" anahtarı açık (varsayılan kapalı) VE `TMIV2_SMARTES_ADRESI` tanımlı. Biri eksikse istek atılmaz,
sunucu açılır; SmartES sayfasındaki "Bağlantı durumu" ve `/saglik/ayrinti` nedeni gösterir.

## Ortam değişkenleri

| Değişken | İçerik |
|---|---|
| `TMIV2_SMARTES_ADRESI` | Servisin `.asmx` adresi, `http://` ya da `https://` ile; yalnız kurum içi (özel IP ya da tek parçalı sunucu adı). |
| `TMIV2_SMARTES_AD_ALANI` | İsteğe bağlı; servisin XML ad alanı. Verilmezse `http://tempuri.org/`. Adres olmadan verilirse sunucu açılmaz. |

Değerler `.env` dosyasına (depoya girmez) ya da sunucu servisinin ortamına yazılır; depoya, karta, belgeye girmez.

## Açmadan önce

1. TMI SmartES'teki "ERP'ye aktarıldı" (IsErp) işaretini koymaz (346 a); bu işareti kullanan eski bağlantı olduğu gibi sürer.
2. SmartES > Kod eşlemeleri sayfasında istasyon ve makine kodlarını girin. İş emri yalnız eşlenmiş istasyona gider.
3. Servisin WSDL'ini (`?WSDL`) açıp şu adları ve parametrelerini doğrulayın; farklıysa bildirin (kod tek dosyada değişir: `sunucu/moduller/smartes/kurallar.ts`):
   - Okuma: `WorkOrdersStatusList` (üretim); `DownTimeStatusListWithoutWorkOrder` (duruş; `START_DATETIME`, `END_DATETIME`, `WORKSTATION_CODE`,
     `MACHINE_CODE`, `INCLUDE_ACTIVES`); `ActiveMachinesList` ve ardından makine başına `AlarmsList` (`MachineID`, `StartDatetime`, `EndDatetime`).
     Alarm satırında kimlik yoktur; kayıt makine + `ALARMTYPE` + `ALARMNO` + `START_DATETIME` ile tekildir.
   - İşaretlemeden okuma: `WsWorkordersRejectStatusList` (hurda), `WarehouseStatusList` (ambar), `QualityControlStatusList` (kalite).
   - Yazma: `WorkOrdersCreateUpdate`, `OperationCreateUpdate`. `SetErpOkRed` çağrılmaz (346 a). İş emrinde çarpan belgedeki yazımla `Multipler`
     adıyla ve her zaman 1 gider; `QuantityUpdate` miktar önceki gönderimden farklıysa true, değilse false; kapatmada false.
     `QuantityUpdate` olmadan SmartES'in miktarı değiştirmeyebileceği bir varsayımdır; ilk gönderimde doğrulayın.
   - Tanım: `WorkStationList` ve `WorkStationCreateUpdate`, `StocksList` ve `StockCreateUpdate`.
   - `DownTimeList` ve `RejectsList` hareket değil, yalnız tanım (ad, renk, grup) döner; kullanılmaz.
   Liste satırlarının alan adlarını da doğrulayın (ilk okumadan sonra satırın ham hâli veritabanında `ham` sütunundadır).
4. Anahtarı açın. İlk okuma son 24 saati alır; sonra 5 dakikada bir (duruş, alarm, kalite, hurda ve ambar 15 dakikada bir) okunur.

## Ne yazar

SmartES'teki üretim verisi silinmez, değiştirilmez. Yazılan yalnız: planlı iş emrinin açılması ve
güncellenmesi, plandan düşen emrin pasif (iptal) ya da bitti yapılması.
