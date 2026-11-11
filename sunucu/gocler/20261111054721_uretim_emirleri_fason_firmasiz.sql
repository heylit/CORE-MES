-- 2874: rotadaki firmasız fason adım (2682 a) emre de firmasız gelir; firmayı sonra satın alma ya da emir ekranı seçer. Ayrı bayrak:
-- var olan fason satırları firma sütunuyla fason kalır, hiçbir satır yeniden yazılmaz; kısıtlar yalnız genişler.
ALTER TABLE uretim_emirleri_is_emri
  ADD COLUMN fason_firmasiz boolean NOT NULL DEFAULT false,
  -- Firmasız fason adımın kaynağı yoktur: makine, kişi, istasyon ve fason firma boştur; operatörle başlamaz, süresi yoktur.
  ADD CONSTRAINT uretim_emirleri_is_emri_firmasiz_kaynaksiz CHECK (NOT fason_firmasiz OR num_nonnulls(makine_id, kisi_id, istasyon_id, fason_firma_id) = 0),
  ADD CONSTRAINT uretim_emirleri_is_emri_firmasiz_suresiz CHECK (NOT fason_firmasiz OR (ayar_suresi_dk IS NULL AND birim_sure_dk IS NULL)),
  DROP CONSTRAINT uretim_emirleri_is_emri_termin_fasonda,
  ADD CONSTRAINT uretim_emirleri_is_emri_termin_fasonda CHECK (termin_gun IS NULL OR fason_firma_id IS NOT NULL OR fason_firmasiz);

-- Firması seçilen adım yeri değişimiyle kayda girer; geri alırken (içeri alma) firmasız hâlden gelindiği bilinir.
ALTER TABLE uretim_emirleri_uretim_yeri_degisimi
  ADD COLUMN eski_fason_firmasiz boolean NOT NULL DEFAULT false;
