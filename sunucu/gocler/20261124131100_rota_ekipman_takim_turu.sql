-- 3652: rota adımının ekipmanına üçüncü tür "takim" (kesici takım kartı); aparatla aynı alanları (kart, adet, aşama) taşır. Yalnız genişler, veri silmez.
ALTER TABLE rota_adim_ekipmani
  DROP CONSTRAINT rota_adim_ekipmani_tur,
  DROP CONSTRAINT rota_adim_ekipmani_tek_hedef,
  ADD CONSTRAINT rota_adim_ekipmani_tur CHECK (tur IN ('aparat', 'olcu_aleti', 'takim')),
  ADD CONSTRAINT rota_adim_ekipmani_tek_hedef CHECK (
    (tur IN ('aparat', 'takim') AND malzeme_id IS NOT NULL AND alet_turu_id IS NULL) OR (tur = 'olcu_aleti' AND alet_turu_id IS NOT NULL AND malzeme_id IS NULL)
  );
ALTER TABLE rota_is_emri_ekipmani
  DROP CONSTRAINT rota_is_emri_ekipmani_tur,
  DROP CONSTRAINT rota_is_emri_ekipmani_tek_hedef,
  ADD CONSTRAINT rota_is_emri_ekipmani_tur CHECK (tur IN ('aparat', 'olcu_aleti', 'takim')),
  ADD CONSTRAINT rota_is_emri_ekipmani_tek_hedef CHECK (
    (tur IN ('aparat', 'takim') AND malzeme_id IS NOT NULL AND alet_turu_id IS NULL) OR (tur = 'olcu_aleti' AND alet_turu_id IS NOT NULL AND malzeme_id IS NULL)
  );
