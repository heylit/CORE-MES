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
