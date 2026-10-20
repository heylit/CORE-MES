# portal: ortaklık

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Hepsi `portal_belge.veri` (jsonb) içinde, belge yoluyla:

| Kavram | Nerede (koleksiyon / alan) | Olası sahibi |
|---|---|---|
| firma (müşteri, tedarikçi) | `parties/*` (ad, tür, vergi, IBAN, iletişim) | finans firma |
| kişi / portal kullanıcısı | `users/*` (firma, rol, e-posta, tercih) | kisiler |
| malzeme / katalog kalemi | `catalog/*` | malzemeler |
| sipariş (satış, satın alma) | `orders/*` (kalem, fiyat, termin, teslimat, fatura) | satin-alma / uretim-emirleri |
| ödeme | `payments/*` | finans |
| uygunsuzluk (NCR) | `ncrs/*` | kalite (gelecek) |
| teklif (RFQ, teklif) | `rfqs/*`, `bids/*`, `requests/*`, `priceReqs/*` | satin-alma |
| belge, sözleşme | `docs/*`, `contracts/*`, `files/*` | dosyalar |
| para birimi, kur, KDV | sipariş alanları; `settings/main.indexes` | finans |
| belge no | sipariş, fatura, irsaliye no alanları | finans / sevkiyat |
| durum listeleri | sipariş, teklif, ödeme, NCR durumları | - |

Kişi sütunları: `portal_belge.olusturan_kisi_id`, `guncelleyen_kisi_id`, `portal_ek.yukleyen_kisi_id` (kisi tablosuna Aşama 2'de bağlanır).
