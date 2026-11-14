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
| emir türü (üretim çeşidi) | `siparisler_siparis_satiri_parti.emir_turu`; liste `paylasilan/sozlesme/emir-turleri.ts` (`EMIR_TURLERI`) | uretim-emirleri (liste); kalem partisi siparisler (3244 b) |
| kalem partisi | `siparisler_siparis_satiri_parti` (satir_id, sira, emir_turu, adet); partisiz kalem tek seri parti sayılır | siparisler; emir `uretim_emri.siparis_parti_id` ile bağlanır (Üretim emirleri ekleyecek) |
| kalem termini | `siparisler_siparis_satiri.termin` boşsa siparişin termini (bağlı); dolu ise elle | siparisler; proje bitişi ve emir teslimi buradan izler (3244 b) |
| emre bağlı kalem | `uretim_emri.siparis_satiri_id` (uretim-emirleri); siparisler okumaz, `kalemEmirCozucusu` ile sorar (kablolama) | uretim-emirleri tutar; siparisler bu kalemi düzenlemede kilitler (SIP-19, 3254 a) |
