# siparisler: ortaklık

| Kavram | Tablo ve sütun | Sahibi |
|---|---|---|
| firma (müşteri) | `siparisler_siparis.firma_id` -> `musteri_tedarikci_firma.id` | musteri-tedarikci |
| malzeme | `siparisler_siparis_satiri.malzeme_no` -> `malzeme_katalog_karti.no` | malzemeler |
| birim | satırda tutulmaz; malzemeden okunur | malzemeler |
| kişi | `olusturan_id`, `guncelleyen_id`, `onaylayan_id` -> `kisi.id` | kisiler |
| para birimi | `siparisler_siparis.para_birimi` (ISO kodu, metin) | finans (bağlamada kur ve liste) |
| gecikme cezası | `siparisler_siparis.gecikme_ceza_orani`, `ceza_tavani_orani` (yüzde, boş olabilir) | plan (öncelik ağırlığı; müşteri varsayılan ceza oranı müşteri-tedarikçide olabilir) |
| ödeme vadesi | `siparisler_siparis.odeme_vadesi_gun` (gün, boş olabilir) | plan (finansman bedeli; müşterinin varsayılan vadesi müşteri-tedarikçide `vadeGunu`) |
| belge no | `siparisler_siparis.no` (SS-yıl-sıra), `musteri_siparis_no` | siparisler |
| durum listesi | `siparisler_siparis.durum` (taslak, onayli, kapandi, iptal) | siparisler |
| satış teklifi | `siparisler_teklif*` | siparisler (148); Portal `requests/*` köprüyle |
| satış siparişi (Portal JSON `orders/*` type sales) | `portal_belge` | siparisler asıl sahip (148); Portal köprüyle okur ve yazar |
| üretim emri bağı | `uretim_emri.siparis_satiri_id` (Üretim emirleri ekleyecek) | uretim-emirleri |
