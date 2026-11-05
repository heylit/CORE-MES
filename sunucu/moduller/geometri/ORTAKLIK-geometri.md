# ORTAKLIK: geometri

| Kavram | Tablo ve sütun | Sahibi | Not |
|---|---|---|---|
| Belge ve revizyon | `geometri_is.belge_id`, `.revizyon_id`, `.ozet`; `geometri_analiz.belge_id`, `.revizyon_id`, `.ozet` | cizimler | yabancı anahtarsız (yön geometri -> cizimler); `cizimler/disari.ts` `kayitlaraBagliYayindakiBelgeler`, `alinanRevizyonDosyasi` |
| Dosya türü | `geometri_is.dosya_turu` (step, iges) | cizimler | Çizim Merkezi'nin dosya türünün alt kümesi |
| Malzeme | (tablo yok) | malzemeler | belge bağı Çizim Merkezi'ndedir; kod ve ad `malzemeler/disari.ts` `malzemeOzetleri` |
| Geometri analizi | `geometri_analiz` (kutu, döndürülmüş kutu, hacim, alan, gövde, kapalılık) | geometri | yalnız bu modülde |
| Tanınan özellik (delik, kademe, havşa, pah, radyüs) | `geometri_ozellik` (tur, cap_mm, derinlik_mm, gecis, dip, aci_derece, yaricap_mm) | geometri | yalnız öneri (2044); Arkon teknik resminin kendi delik tanıması (`stepdraw.ts` `findCylinders`) ayrıdır, bu tabloyu okuması ayrı karttır |
| Montaj ağacı ve bileşen listesi (ad, adet, kutu, hacim) | `geometri_montaj` (sira, ust_sira, tur, ad, kutu_en, kutu_ust, obb_*, hacim_mm3) | geometri | yalnız öneri (2109). Bileşen adı dosyadaki addır, malzeme kartına bağlanmaz; montajdan reçete (M2) ve resimli adım (2098 H3) ayrı karttır. Reçete ve Rota'nın kendi ürün ağacı ayrıdır |
| Yüzey işareti (yüz başına işlem, öneri) | `geometri_yuzey_isaret` (revizyon_id, surum, guncelleyen_kisi_id, guncelleme), `geometri_yuzey_islem` (yuz_sira, islem, op_no, sartname_id, oneri) | geometri | 2144; bir yüz tek işlem (2144-1 a) |
| Rota adımı ve işlem şartnamesi | `geometri_yuzey_islem.op_no`, `.sartname_id` | rota | yabancı anahtarsız (rota geometriyi okur); adım listesi çözücüyle `rota/disari.ts`'den, bağ `kablolama.ts` (ADR 0006 madde 6). İşlem kategorileri KPL, DNS, AST, BYA, YHZ rotanın `rota_islem_kategorisi.kod`'udur |
| Kişi | `geometri_yuzey_isaret.guncelleyen_kisi_id` | kisiler | ad `kisiler/disari.ts` `kisiAdlari` |
| Analiz kuyruğu ve durum listesi | `geometri_is.durum` (bekliyor, calisiyor, bitti, hata) | geometri | `paylasilan/sozlesme/geometri.ts` |
| Stok ölçüsü (hammadde formu ve ölçüleri) | `malzeme_katalog_karti.kayit` (form, dims) | malzemeler | `hammaddeStokOlculeri` ile okunur (1469 a) |
| İşleme payı | sistem ayarı `geometri.ham-payi-mm` | geometri | ayar tablosu |
| Yoğunluk (kalite) | özel kalite `kayit.custom.p.ro`, ayarda eklenen kalite `malzeme_katalog_ayari` 'malzeme'.kaliteler[].p.ro; yerleşik kalite yalnız istemci tablosu | malzemeler | sunucu `hammaddeStokOlculeri`, istemci `malzemeler/disari.ts` `yerlesikKaliteYogunlugu` (1480) |
