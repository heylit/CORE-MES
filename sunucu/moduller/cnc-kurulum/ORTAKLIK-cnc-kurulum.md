# cnc-kurulum: ortaklık

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Hepsi `cnc_kurulum_kayit.deger` (jsonb) içinde, anahtar `cnc-kurulum-motoru.v1`:

| Kavram | Nerede (alan) | Olası sahibi |
|---|---|---|
| istasyon / tezgâh | `machine` (seçili), `customMachines`, `mo` (tezgâh değer düzeltmeleri), `mstat` | istasyonlar |
| malzeme (iş parçası) | `material`, `customMats`, `matO`, `stock.mat` | malzemeler |
| takım, tutucu, aparat (kütüphane) | `custom`, `tools`, `byType`, `active` | malzemeler (takım kartı) |
| stok miktarı | `inv` (miktar, en az), `gstock`, `gstockMan` | stok |
| ölçü aleti | `gauges` | kalibrasyon |
| sarf malzemesi | `cons` | malzemeler / stok |
| takım ömrü ve aşınma | `life`, `wear`, `wearLog` | bakım (Arkon) / stok |
| üretim kaydı (adet) | `wearLog` ("Üretildi olarak kaydet": tezgâh, adet, zaman) | uretim-emirleri |
| parça ve program bilgisi | `meta` (parça, program, operasyon, ham ölçü), `gsim`, `gsimText` (son NC programı) | uretim-emirleri / cizimler |
| üretim emri (kurulumda seçilen) | anahtar `cnc-kurulum-motoru.emir`: emir kimliği, no, parça no ve adı, adet, istasyon adı (`uretim-emirleri/disari.ts` `acikEmirler`'den, seçim anındaki kopya); yalnız `POST /cnc-kurulum/emir-sec` yazar | uretim-emirleri |
| emir başına kurulum | `cnc-kurulum-motoru.emir.<emir id>`: emrin seçimleri (`machine`, `material`, `coolant`, `byType`, `wcs`, `tools`, `gauges`, `cons`), `meta`, `prep` ve `secim`; emir değişince saklanır ve geri yüklenir (kullanıcı kararı 17.10.2026). `cnc-kurulum-motoru.secim`: seçili emrin "seçildi" adımları | uretim-emirleri |
| durum listeleri | hazırlık adımları `prep.done`, stok durumu (yok / kritik / yeterli) | - |

Hazırlık onay defteri: `cnc_kurulum_hazirlik_olayi` (adim, olay, imza, `emir_id` ve `is_emri_id` uretim-emirleri, `kisi_id` kisiler); Terminal `disari.ts` `isEmriHazirlikDurumlari` (toplu) ile okur. "Kurulum tamam" aynı defterde `adim = 'kurulum'`, `olay = 'tamam'`, imza seçimlerin izidir; hazırlık durumuna sayılmaz.

Kişi sütunu: `cnc_kurulum_kayit.guncelleyen_kisi_id` (kisi tablosuna Aşama 2'de bağlanır).
