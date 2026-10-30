# Ortaklık: musteri-tedarikci modülünün tuttuğu kavramlar

Firma bu modülündür (CLAUDE.md, kart #1164). Başka modül firmayı kopyalamaz; `firma_id int REFERENCES musteri_tedarikci_firma(id)` ile bağlanır, ad, özet, arama ve konumu `sunucu/moduller/musteri-tedarikci/disari.ts` ile alır.

| Kavram | Tablo ve sütun | Biçim / değerler | Başka modülde de olabilir |
|---|---|---|---|
| Firma | `musteri_tedarikci_firma.id` | int, değişmez | finans belge/ödeme/çek, satın alma, sevkiyat noktası, projeler, rota, üretim emri, portal, Logo |
| Firma kodu, adı | `kod` (en çok 40, harf duyarsız tekil), `ad` (en çok 200) | | Logo cari kodu |
| Firma türü | `tur` | `musteri`, `tedarikci`, `ikisi` | sevkiyat noktası türü (`musteri`, `tedarikci`, `fason`) |
| Fason işareti | `fason` | boolean (S3: kartta kalır) | üretim emri fason adımı |
| Etkinlik | `aktif` | boolean; silme yok | |
| Ülke, vergi | `ulke_kodu`, `vergi_no`, `vergi_dairesi` | ISO iki harf; TR'de 10/11 rakam | |
| Para birimi | `para_birimi` | ISO 4217, varsayılan TRY | finans, satın alma |
| Vade günü | `vade_gunu` | 0-365 | finans |
| İletişim | `telefon`, `e_posta` | | kisiler (kişi iletişimi ayrı kavram) |
| Merkez adresi | `adres`, `ilce`, `il`, `posta_kodu`, `enlem`, `boylam` | koordinat ikisi birlikte (MT-7) | sevkiyat noktası adresi ve koordinatı |
| Ek adresler | `musteri_tedarikci_adres` (`tur`: `fatura`, `teslim`, `sube`; `ad`, adres alanları, `enlem`, `boylam`) | firma başına en çok 50, ad firma içinde tekil | sevkiyat (teslim noktası), finans (fatura adresi), satın alma (teslim yeri) |
| Logo bağı | `logo_cari_kodu`, `logo_kayit_no`, `logo_gonderim_durumu` | yalnız Logo köprüsü yazar | logo |
| Tedarikçi karnesi olayı | `musteri_tedarikci_karne_olayi` (`kaynak`, `anahtar` tekil; `tur` `teslim`: `termin`, `teslim_gunu`, `tam`; `tur` `lot`: `lot_karari`) | kaynak `satin-alma`, `kalite-merkezi`, `uretim-emirleri`; karar `kabul`, `sartli_kabul`, `hatali_kabul`, `red`, `iade` (1259 c) | satın alma teslimi, Kalite Merkezi GKK/NCR kararı, fason dönüşü; kaynak modül `disari.ts` `karneOlayiYaz` ile iter |
| Hizmet puanı | `musteri_tedarikci_hizmet_puani` (`puan` 1-5, `not`, `giren_id`) | satın almanın elle tedarikçi puanının yerine geçer (1262, 1259 c) | satın alma `satin_alma_tedarikci.puan`, `satin_alma_tedarikci_degerlendirmesi` (salt okunur olacak) |
| Yıllık karne | `musteri_tedarikci_yillik_karne` (`yil` firma başına tekil, `teslim_orani`, `kalite_puani`, `hizmet_puani`, `puan`, `sinif` A-D) | 1260 a | Kalite Merkezi tedarikçi onayı (`sup.onay`) karneden öneri alır, sahibi KM'dir (236 a) |
