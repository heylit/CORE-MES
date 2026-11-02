-- 1735 (B8): CCB reddi iç olay günlüğüne de yazılır. Yalnız CHECK genişler; var olan satırlar değişmez.
ALTER TABLE degisiklik_yonetimi_olay DROP CONSTRAINT degisiklik_yonetimi_olay_tur_degeri;
ALTER TABLE degisiklik_yonetimi_olay ADD CONSTRAINT degisiklik_yonetimi_olay_tur_degeri CHECK (tur IN (
  'talep_gonderildi', 'etki_analizi', 'musteri_onayi_istendi', 'emir_acildi', 'revizyon_yayinlandi', 'gecerlilik', 'karar_onerildi',
  'emir_karari', 'stok_karari', 'emir_karantinada', 'rework_istendi', 'sapma_acildi', 'fai_onaylandi', 'emir_kapandi',
  'talep_reddedildi'
));
