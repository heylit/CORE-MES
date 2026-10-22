# Ortaklık (saat)

Modülün tek tablosu `saat_uyari_ustlenme`dir; öbür kavramlar başka modülün `disari.ts` okumasıdır.

| Kavram | Sahibi | Okunan ya da tutulan |
|---|---|---|
| uyarı üstlenmesi (uyarı kimliği, kişi, an) | saat | `saat_uyari_ustlenme.kimlik`, `kisi_id`, `ustlenme` |
| kişi adı, işlemleri | kisiler | `kisiAdlari`; kişi `kisi_id` ile (yabancı anahtar `kisi`) |
| iş merkezi, istasyon, makine, makine durumu, kişi kapsamı | istasyonlar | `aktifIstasyonlar`, `aktifMakineler`, `istasyonGetir`, `makineDurumlari`, `kisininIzinliIsMerkezleri` |
| üretim emri, iş emri, sayım, duruş | uretim-emirleri | `acikEmirler`, `acikEmir`, `aralikAdetleri`, `gunlukAralikAdetleri`, `planlanacakIsEmirleri`, `emirDurdur` |
| kişinin vardiyası ve çalışma günü | vardiya | `basladigiGunTakvimleri`, `kisiVardiyalari`, `vardiyaTanimlari` |
| canlı plan yerleşimi | plan | `canliSira` |
| duruş nedeni | durus-nedenleri | `durusNedenleriniListele` |
| ölçü aleti ve vadesi | kalibrasyon | `aletlerVeKayitlari` |
| stok, sarf | stok | `stokMiktarlari`, `emirlerinNetSarfi` |
| 3B önizleme | cizimler | `yayindakiOnizleme`, `yayindakiOnizlemeKaresi` |
