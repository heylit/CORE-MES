-- 2681 (karar 2682 a): rota adımı firması henüz seçilmemiş fason (dış üretim) olarak kaydedilebilir. Ayrı bayrak: var olan fason satırları
-- firma sütunuyla fason kalır, hiçbir satır yeniden yazılmaz; kısıtlar yalnız genişler.
ALTER TABLE rota_adimi
  ADD COLUMN fason_firmasiz boolean NOT NULL DEFAULT false,
  -- Firmasız fason adımın kaynağı yoktur: makine, kişi, istasyon ve fason firma boştur.
  ADD CONSTRAINT rota_adimi_firmasiz_kaynaksiz CHECK (NOT fason_firmasiz OR num_nonnulls(makine_id, kisi_id, istasyon_id, fason_firma_id) = 0),
  DROP CONSTRAINT rota_adimi_termin_fasonda,
  ADD CONSTRAINT rota_adimi_termin_fasonda CHECK (termin_gun IS NULL OR fason_firma_id IS NOT NULL OR fason_firmasiz),
  DROP CONSTRAINT rota_adimi_fason_suresiz,
  ADD CONSTRAINT rota_adimi_fason_suresiz CHECK ((fason_firma_id IS NULL AND NOT fason_firmasiz) OR (ayar_suresi_dk IS NULL AND birim_sure_dk IS NULL));
