# ORTAKLIK: kalite-merkezi

Kalite Merkezi kayıtlarını kendi biçiminde tek tabloda tutar: `kalite_merkezi_belge` (koleksiyon, kimlik, govde jsonb).
Aşağıdaki kavramlar başka modülde de vardır; Aşama 1'de bağlanmaz.

| Kavram | Burada (koleksiyon: alanlar, VARSAYIM: formlardan okunduğu kadarıyla) | Depodaki sahibi |
|---|---|---|
| Ölçüm cihazı, kalibrasyon kaydı | `dev`: kod, ad, tip, seri no, lokasyon, son/sonraki kalibrasyon, izlenebilirlik | `kalibrasyon` (olcu_aleti, olcu_aleti_turu) |
| Tedarikçi | `sup`: ad, kod, `firmaId` (236 a), onay, sertifikalar, PPM | firma: `musteri-tedarikci` (`musteri_tedarikci_firma`, kayıt `firmaId` ile bağlanır); onay durumu: kalite-merkezi (236 a, tek sahip; satın alma `disari.ts` `tedarikciOnayDurumlari` ile okur) |
| Parça | `parca` ve kayıtlardaki parça no, revizyon | `malzemeler` |
| İş emri / sipariş | `emir`: no, parça no (ERP CSV aktarımı) | `uretim-emirleri`; ERP: `logo` |
| Kişi, rol, PIN | `kullanici` (Muayeneci, Kalite mühendisi, Kalite yöneticisi) | `kisiler`, `oturum` |
| Değişiklik izi | `iz` (yalnız eklenir) | `denetim` |
| Belge, sertifika, fotoğraf | `belge`; dosyalar ortak depoda | `dosya` (bağ: modül `kalite-merkezi`) |
| Teknik resim, model, balon | `cizim` | planlanan `cizim` (#80), Arkon çizim ekranı |
| Muayene, lot kabul, SPC | `insp`, `lot`, `spc` | planlanan `kalite` (#78, numune talebi), Arkon `/arkon/kalite` |
| Uygunsuzluk, DÖF | `ncr`, `capa` | kalite-merkezi (155 a, DÖF'ün tek sahibi); denetim-hazirlik bulgudan DÖF'ü `disari.ts` `dofAc` ile açar, `dofDurumlari` ile okur. `capa` alanları: `kaynak`, `kaynakAnahtari`, `kaynakMadde`, `kaynakSeviye`, `kaynakAciklama` |
| Form şablonu, kontrol listesi | `frm`, `tpl` | planlanan `kontrol-plani` (#74) |
| Para birimi, birim | kayıt alanlarında metin | `finans`, `malzemeler` |
| Durum listeleri (NCR durumu, ciddiyet, MRB kararı) | uygulamada sabit | yok |
