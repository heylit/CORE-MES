# Güvenlik denetimi: smartes (kart #778)

Uçlar: `GET /smartes/menu-sayaclari` (oturum; sayfayı göremeyene boş), `GET /smartes/durum`, `/eslemeler`, `/is-emri-durumlari`, `/duruslar`,
`/alarmlar`, `/giden` (`sayfa.smartes`), `POST /smartes/eslemeler/ata` ve `/kaldir` (`smartes.esleme-yaz`, yalnız yönetici). İşler kişisiz
(ADR 0010 karar 7); başka modüle yazmaz.

| Yüzey | Kural | Test |
|---|---|---|
| Ortam değişkeni | yalnız `TMIV2_SMARTES_*`; kurum içi adres; kimlik ve sorgu taşımaz | `SME-1`, `SME-2` |
| SOAP isteği | yönlendirme izlenmez; süre 30 sn (liste 60 sn); metot ve parametre adı denetlenir, değer kaçırılır | `SME-3`, `SME-8` |
| XML cevabı | DTD ve tanımsız varlık reddedilir (XXE yok); gövde en çok 32 MiB | `SME-5`, `SME-6` |
| Hata metni | adres taşımaz; SmartES iletisi kırpılır; ekranda React kaçırarak basar | `SME-10`, `SME-11 (ret)` |
| Kapalı bağlantı | anahtar kapalı ya da adres yok: istek ve yazma yok | `SME-16` |
| MES verisi | silme metodu yok; yalnız iş emri açma/güncelleme, pasif/bitti (işaret yok, 346 a) | `SME-15` |
| Eşleme uçları | yazma yalnız `smartes.esleme-yaz`; kod 1-50, türde tekil; sürüm | `SME-17` |
| Okuma uçları | `sayfa.smartes` | `SME-18` |
| Hazırlık ve canlı deneme (`GET /smartes/hazirlik`, `.../kontrol`) | `saglik.ayrinti-oku` (yalnız yönetici); yazma metodu çağrılmaz, MES verisi değişmez; ileti adres taşımaz | `SME-H2`, uç testleri |

## Sonradan eklenen akışlar (kalite/ambar okuması, tanım gönderimi)

Yeni uç, yetki işlemi, rol ya da sayfa yok; iki iş (`smartes-okuma-red|ambar|kalite`, `smartes-tanim-gonderimi`) kişisiz koşar.

| Yüzey | Kural | Test |
|---|---|---|
| Çift anahtar | her akış kendi anahtarı (`smartes.kalite-ambar-okumasi`, `smartes.tanim-gonderimi`, varsayılan kapalı) VE `smartes.baglanti` VE `TMIV2_SMARTES_ADRESI` olmadan istek ve yazma yok | `SME-20`, `SME-21` |
| MES verisi | `RejectStatusSetIsErp`, `WarehouseStatusSetIsErp`, `QualityControlStatusSetIsErp`, `SetErpOkRed` ve silme metotları hiçbir akışta çağrılmaz (346 a: işaretleme işi kaldırıldı); metot adı istek öncesi `yasakMetotMu` ile denetlenir, bozulursa tur istek atmadan düşer | `SME-20 yasak metot kuralı`, `SME-20 ... çağrılmaz` |
| Tanım gönderimi | yalnız SmartES'te kodu olmayan kayda `CreateUpdate` gider (önce liste okunur); var olan kodun adı ezilmez; liste okunamazsa gönderim yok | `SME-21` |
| Çift gönderim | niyet ayrı turda kalıcı yazılır; yazan süreçte taze, başka süreçte belirsiz; sonucu bilinmeyen istek yinelenmez (`yinele: false`) | `SME-21 ... yinelenmez` |
| Okunan veri | yalnız `smartes_*` tablolarında, SmartES kimliğiyle tekil, ham satır `jsonb`; stok ve kalite modülüne yazılmaz | `SME-20` |
| Hata metni | adres taşımaz; SmartES iletisi kırpılır | `SME-20 ağ hatasında ...` |
