# mesaj: ortaklık

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Hepsi `mesaj_belge.veri` (jsonb) içinde, belge yoluyla:

| Kavram | Nerede (koleksiyon / alan) | Olası sahibi |
|---|---|---|
| kişi | `by`, `createdBy`, `to`, `approvers` alanlarında TMI kişi no (metin) | kisiler |
| sipariş | `orders/*` (müşteri, parça, adet, termin; içe aktarım) | uretim-emirleri / satış |
| üretim kaydı (adet girişi) | `orders/*` içinde `prodEntry` | uretim-emirleri |
| istasyon / makine | sipariş ve görev metinlerinde | istasyonlar |
| firma (müşteri) | `orders/*.customer` metin | finans firma |
| durum listeleri | görev `todo/doing/done`, onay `wait/ok/no` | - |

Kişi sütunları: `mesaj_belge.olusturan_kisi_id`, `guncelleyen_kisi_id`, `mesaj_ek.yukleyen_kisi_id` (kisi tablosuna Aşama 2'de bağlanır).
