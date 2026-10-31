# ORTAKLIK: geometri

| Kavram | Tablo ve sütun | Sahibi | Not |
|---|---|---|---|
| Belge ve revizyon | `geometri_is.belge_id`, `.revizyon_id`, `.ozet`; `geometri_analiz.belge_id`, `.revizyon_id`, `.ozet` | cizimler | yabancı anahtarsız (yön geometri -> cizimler); `cizimler/disari.ts` `kayitlaraBagliYayindakiBelgeler`, `alinanRevizyonDosyasi` |
| Dosya türü | `geometri_is.dosya_turu` (step, iges) | cizimler | Çizim Merkezi'nin dosya türünün alt kümesi |
| Malzeme | (tablo yok) | malzemeler | belge bağı Çizim Merkezi'ndedir; kod ve ad `malzemeler/disari.ts` `malzemeOzetleri` |
| Geometri analizi | `geometri_analiz` (kutu, döndürülmüş kutu, hacim, alan, gövde, kapalılık) | geometri | yalnız bu modülde |
| Analiz kuyruğu ve durum listesi | `geometri_is.durum` (bekliyor, calisiyor, bitti, hata) | geometri | `paylasilan/sozlesme/geometri.ts` |
| Yoğunluk, stok ölçüsü, işleme payı | (tablo yok) | malzemeler | 1446 a ve 1447 a ile ayrı yamalarda okunur |
