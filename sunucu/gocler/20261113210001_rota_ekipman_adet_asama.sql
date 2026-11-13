-- 3199 (A): rota adımının aparatı ve özel takımı planın ikincil kaynağıdır; adım kaç adet ve hangi aşamada (ayar ve işleme boyunca ya da
-- yalnız işlemede) istediğini söyler. Yalnız ekleyen göç: var olan satırlar 1 adet, ayar ve işleme olur. Ölçü aletinde alanlar kullanılmaz.
ALTER TABLE rota_adim_ekipmani
  ADD COLUMN adet int NOT NULL DEFAULT 1 CONSTRAINT rota_adim_ekipmani_adet CHECK (adet BETWEEN 1 AND 100),
  ADD COLUMN asama text NOT NULL DEFAULT 'ayar_isleme' CONSTRAINT rota_adim_ekipmani_asama CHECK (asama IN ('ayar_isleme', 'isleme'));
ALTER TABLE rota_is_emri_ekipmani
  ADD COLUMN adet int NOT NULL DEFAULT 1 CONSTRAINT rota_is_emri_ekipmani_adet CHECK (adet BETWEEN 1 AND 100),
  ADD COLUMN asama text NOT NULL DEFAULT 'ayar_isleme' CONSTRAINT rota_is_emri_ekipmani_asama CHECK (asama IN ('ayar_isleme', 'isleme'));
