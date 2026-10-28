# ORTAKLIK: kalite-merkezi

Kalite Merkezi kayıtlarını kendi biçiminde tek tabloda tutar: `kalite_merkezi_belge` (koleksiyon, kimlik, govde jsonb).
Aşağıdaki kavramlar başka modülde de vardır; Aşama 1'de bağlanmaz.

| Kavram | Burada (koleksiyon: alanlar, VARSAYIM: formlardan okunduğu kadarıyla) | Depodaki sahibi |
|---|---|---|
| Ölçüm cihazı, kalibrasyon kaydı | `dev`: kod, ad, tip, seri no, lokasyon, son/sonraki kalibrasyon, izlenebilirlik | `kalibrasyon` (olcu_aleti, olcu_aleti_turu) |
| Tedarikçi | `sup`: ad, kod, `firmaId` (236 a), onay, sertifikalar, PPM | firma: `musteri-tedarikci` (`musteri_tedarikci_firma`, kayıt `firmaId` ile bağlanır); onay durumu: kalite-merkezi (236 a, tek sahip; satın alma `disari.ts` `tedarikciOnayDurumlari` ile okur) |
| Parça | `parca`: parça no (bağ anahtarı), `malzemeNo`, sınıf, not; kayıtlardaki parça no, revizyon | `malzemeler` (592 B2 a: numara ve ad karttan, `/kalite-merkezi/parca-kaynaklari`; eski kartta ad, malzeme, tedarikçi durur, yeni kartta yazılmaz) |
| İş emri / sipariş | tutulmaz (592 B1 c); eski `emir` kayıtları salt okunur durur. Lot, muayene, NCR "İş emri / sipariş" alanında numara, belge bağında kaynak kimliği (`ue-`, `sa-`, `ms-`) | `uretim-emirleri` (iş emri), `satin-alma` (sipariş satırı), `siparisler` (müşteri siparişi); `/kalite-merkezi/emir-kaynaklari` |
| Kişi, rol, PIN | `kullanici` (Muayeneci, Kalite mühendisi, Kalite yöneticisi) | `kisiler`, `oturum` |
| Değişiklik izi | `iz` (yalnız eklenir) | `denetim` |
| Belge, sertifika, fotoğraf | `belge`; dosyalar ortak depoda | `dosya` (bağ: modül `kalite-merkezi`) |
| Teknik resim, model, balon | `cizim` (eski); stüdyo: `kalite_merkezi_resim` (malzeme_no, merkez_belge_id, ozet, revizyon), `kalite_merkezi_balon` (no, nominal, tolerans, alt, ust, alet, siklik, kritik, yontem) | kalite-merkezi (595 1 b, 597 a). Dosya: `cizimler` (`cizimler_belge`, yayındaki revizyonun özeti); parça: `malzemeler` (`malzeme_katalog_karti.no`). Arkon `plan` ve `files` kopyası taşınınca kalkar (ayrı onay) |
| Numune planı, numune, ölçüm, numune kararı | `kalite_merkezi_numune_plani` (malzeme_no, op_no, kurallar), `kalite_merkezi_numune` (uretim_emri_id, op_no, balonlar), `kalite_merkezi_numune_karari` (karar: onay, ret, sapma), `kalite_merkezi_olcum` (deger ya da nitel, uygun, kaynak: operator, kalite, cmm) | kalite-merkezi (600 a). Emir: `uretim-emirleri` (`uretim_emri.id`); kişi: `kisiler`. Arkon `requests`, `results`, `logMeas` kopyası taşınınca kalkar (ayrı onay) |
| Muayene, lot kabul, SPC | `insp`, `lot`, `spc` | planlanan `kalite` (#78, numune talebi), Arkon `/arkon/kalite` |
| Uygunsuzluk, DÖF | `ncr`, `capa` | kalite-merkezi (155 a, DÖF'ün tek sahibi); denetim-hazirlik bulgudan DÖF'ü `disari.ts` `dofAc` ile açar, `dofDurumlari` ile okur. `capa` alanları: `kaynak`, `kaynakAnahtari`, `kaynakMadde`, `kaynakSeviye`, `kaynakAciklama`. `ncr` `kaynakEmirId`: hatalı parça kararından açılan NCR'nin kaynak üretim emri (`uretim_emri.id`, yalnız sunucu yazar; 1074 a-netleştirme); emir kapanışının NCR maddesi bunu ve `emir` alanındaki numarayı okur |
| Form şablonu, kontrol listesi | `frm`, `tpl` | planlanan `kontrol-plani` (#74) |
| Para birimi, birim | kayıt alanlarında metin | `finans`, `malzemeler` |
| Durum listeleri (NCR durumu, ciddiyet, MRB kararı) | uygulamada sabit | yok |
