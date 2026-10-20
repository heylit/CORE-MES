# idari-isler: ortaklık

| Kavram | Tablo ve sütun | Sahibi |
|---|---|---|
| kişi | `idari_isler_talep.acan_kisi_id`, `ustlenen_kisi_id`, `kapatan_kisi_id` -> `kisi.id` | kisiler |
| yer (alan) | `idari_isler_talep.yer` (serbest metin) | Fabrika haritası (bağlamada) |
| belge no | `idari_isler_talep.no` (TT-yıl-sıra) | idari-isler |
| durum listesi | `idari_isler_talep.durum` (yeni, yapiliyor, kapandi, reddedildi, geri_cekildi) | idari-isler |
| talep konusu | `idari_isler_talep.kategori` (sabit liste) | idari-isler |
| aciliyet | `idari_isler_talep.aciliyet` (normal, acil) | idari-isler |
| firma | `idari_isler_kontrol.firma_id`, `idari_isler_kontrol_kaydi.firma_id` -> `musteri_tedarikci_firma.id` | musteri-tedarikci |
| kişi | `idari_isler_kontrol.olusturan_kisi_id`, `bitiren_kisi_id`, `idari_isler_kontrol_kaydi.kaydeden_kisi_id` -> `kisi.id` | kisiler |
| birim | `idari_isler_kontrol_kaydi.birim` (kg, ton, lt, m3, adet) | malzemeler (bağlamada) |
| belge no | `idari_isler_kontrol_kaydi.belge_no` (rapor ya da atık form no) | idari-isler |
| kontrol türü | `idari_isler_kontrol.tur` (yasal, sozlesme, atik) | idari-isler |
| sözleşme | `idari_isler_kontrol` (tür sozlesme; yalnız tarih ve belge) | idari-isler; tutar Finans'ta |
| kişi | `idari_isler_yemek_bildirimi.bildiren_kisi_id` -> `kisi.id` | kisiler |
| vardiya kadrosu | `idari_isler_yemek_bildirimi.kadro` (bildirim anındaki sayı) | vardiya |
| izin | `idari_isler_yemek_bildirimi.izinli` (bildirim anındaki sayı) | ik |
| fazla mesai | `idari_isler_yemek_bildirimi.fazla_mesai` (bildirim anındaki sayı, İK `gununFazlaMesaisi`) | ik |
| ziyaretçi | `idari_isler_yemek_bildirimi.ziyaretci` (sayı, bugün elle) | nizamiye (bağlamada) |
| araç | `idari_isler_arac.plaka` (tekil), `tur`, `sahiplik`, `km` | idari-isler (172 a); sevkiyat_araci bağlamada plaka ile |
| durum listesi | `idari_isler_arac.durum` (musait, gorevde, serviste, pasif) | idari-isler |
| kişi | `idari_isler_arac.olusturan_kisi_id`, `idari_isler_arac_gorevi.talep_eden_kisi_id`, `onaylayan_kisi_id`, `kapatan_kisi_id` -> `kisi.id` | kisiler |
| durum listesi | `idari_isler_arac_gorevi.durum` (bekliyor, onaylandi, yolda, tamamlandi, reddedildi, geri_cekildi) | idari-isler |
| araç görevi | `idari_isler_arac_gorevi.arac_id` -> `idari_isler_arac.id`, `cikis_km`, `donus_km` | idari-isler; Sevkiyat'ın sefer kaydı bağlamada ayrı kalır |

| para birimi | `idari_isler_arac_masrafi.tutar` (TL, numeric(12,2)) | Finans (bağlamada) |
| belge no | `idari_isler_arac_masrafi.belge_no` (fiş ya da fatura no, serbest metin) | Finans (bağlamada) |
| kişi | `idari_isler_arac_masrafi.kaydeden_kisi_id`, `iptal_eden_kisi_id` -> `kisi.id` | kisiler |
| masraf türü | `idari_isler_arac_masrafi.tur` (yakit, bakim, onarim, lastik, muayene, sigorta, ceza, otoyol, kira, diger) | idari-isler |
| demirbaş | `idari_isler_demirbas` (tür, marka ve model, seri no, değer, durum) | idari-isler; malzeme kartı (model) `malzemeler`, muhasebe kıymeti Finans (bağlamada) |
| kişi | `idari_isler_zimmet.kisi_id`, `veren_kisi_id`, `iade_alan_kisi_id`, `idari_isler_demirbas.olusturan_kisi_id` -> `kisi.id`; kişisiz kayıtta `personel_adi` | kisiler |
| zimmet | `idari_isler_zimmet` (veriliş, iade, iade durumu); `kaynak_ik_kimlik` -> eski `ik_zimmet.kimlik` | idari-isler (244 a); İK okur |
| durum listesi | `idari_isler_demirbas.durum` (bosta, zimmetli, bakimda, kayip, hurda), `idari_isler_zimmet.iade_durumu` (saglam, hasarli, kayip) | idari-isler |
| para birimi | `idari_isler_demirbas.deger` (TL, numeric(14,2)) | Finans (bağlamada) |
