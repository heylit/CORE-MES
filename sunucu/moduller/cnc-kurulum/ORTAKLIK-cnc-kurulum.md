# cnc-kurulum: ortaklık

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Hepsi `cnc_kurulum_kayit.deger` (jsonb) içinde, anahtar `cnc-kurulum-motoru.v1`:

| Kavram | Nerede (alan) | Olası sahibi |
|---|---|---|
| istasyon / tezgâh | `machine` (seçili), `customMachines`, `mo` (tezgâh değer düzeltmeleri), `mstat` | istasyonlar |
| malzeme (iş parçası) | `material`, `customMats`, `matO`, `stock.mat` | malzemeler |
| takım, tutucu, aparat (kütüphane) | `custom`, `tools`, `byType`, `active`; kalem kimliği (`inv` anahtarı) sarf ya da demirbaş kartına bağlanır | malzemeler (takım kartı) |
| stok miktarı | `inv` (miktar, en az, konum). Bağlı kalemde (`inv[...].tmiStok`: malzeme id, kod, ad) miktar okurken `stok` kullanılabilir miktarıdır, azalış `stok` çıkışıdır (153 a, 164 b); bağ `malzeme_katalog_karti.cnc_kutuphane_kimligi` (malzemeler, 163 b). `gstock`, `gstockMan` G-kod benzetiminin ham ölçüsüdür, stok değildir | stok (bağlı kalemde sahibi) |
| ölçü aleti | `gauges` | kalibrasyon |
| sarf malzemesi | `cons` | malzemeler / stok |
| takım ömrü ve aşınma | `life`, `wear`, `wearLog` | bakım (Arkon) / stok |
| üretim kaydı (adet) | `wearLog` ("Üretildi olarak kaydet": tezgâh, adet, zaman) | uretim-emirleri |
| parça ve program bilgisi | `meta` (parça, program, operasyon, ham ölçü), `gsim`, `gsimText` (son NC programı) | uretim-emirleri / cizimler |
| üretim emri (kurulumda seçilen) | anahtar `cnc-kurulum-motoru.emir`: emir kimliği, no, parça no ve adı, adet, istasyon adı (`uretim-emirleri/disari.ts` `acikEmirler`'den, seçim anındaki kopya); yalnız `POST /cnc-kurulum/emir-sec` yazar | uretim-emirleri |
| emir başına kurulum | `cnc-kurulum-motoru.emir.<emir id>`: emrin seçimleri (`machine`, `material`, `coolant`, `byType`, `wcs`, `tools`, `gauges`, `cons`), `meta`, `prep` ve `secim`; emir değişince saklanır ve geri yüklenir (kullanıcı kararı 17.10.2026). `cnc-kurulum-motoru.secim`: seçili emrin "seçildi" adımları | uretim-emirleri |
| durum listeleri | hazırlık adımları `prep.done`, stok durumu (yok / kritik / yeterli) | - |

Hazırlık onay defteri: `cnc_kurulum_hazirlik_olayi` (adim, olay, imza, `emir_id` ve `is_emri_id` uretim-emirleri, `kisi_id` kisiler); Terminal `disari.ts` `isEmriHazirlikDurumlari` (toplu) ile okur. "Kurulum tamam" aynı defterde `adim = 'kurulum'`, `olay = 'tamam'`, imza seçimlerin izidir; hazırlık durumuna sayılmaz.

Tezgâh ayarı (1091 a, 1139 b): `cnc_kurulum_tezgah` (`makine_id` istasyonlar `makine`, `guncelleyen_kisi_id` kisiler). Tezgâhın kendisi (kod, ad, istasyonu, aktiflik) istasyonlardadır ve kopyalanmaz; burada yalnız motorun alanları: `tur`, `kontrol`, `konik`, `cep_sayisi`, `devir`, `is_mili_devri`, `canli_takim`, `canli_devir`, `elle`, `model_turu` (prototipin kodlarıyla).

Kişi sütunu: `cnc_kurulum_kayit.guncelleyen_kisi_id` (kisi tablosuna Aşama 2'de bağlanır).
