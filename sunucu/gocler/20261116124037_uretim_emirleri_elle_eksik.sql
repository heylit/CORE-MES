-- 3322: hazırlık maddesi elle "hazır değil" de yazılır (iki yönlü elle durum); yalnız kısıt genişler, var olan satırlar değişmez.
ALTER TABLE uretim_emirleri_hazirlik_onayi DROP CONSTRAINT uretim_emirleri_hazirlik_onayi_olay;
ALTER TABLE uretim_emirleri_hazirlik_onayi ADD CONSTRAINT uretim_emirleri_hazirlik_onayi_olay CHECK (olay IN ('onay', 'eksik', 'kaldir'));
ALTER TABLE uretim_emirleri_hazirlik_onayi DROP CONSTRAINT uretim_emirleri_hazirlik_onayi_dolu;
ALTER TABLE uretim_emirleri_hazirlik_onayi ADD CONSTRAINT uretim_emirleri_hazirlik_onayi_dolu CHECK ((olay IN ('onay', 'eksik')) = (sistem_hali IS NOT NULL));
