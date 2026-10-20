-- Kısıtlar adlandırılır (plan borcu P-B10, P-B22): yalnız kısıt adı değişir, satır ve tanım aynı kalır.
ALTER TABLE plan_senaryo_yerlesimi RENAME CONSTRAINT plan_senaryo_yerlesimi_pkey TO plan_senaryo_yerlesimi_tekil;
ALTER TABLE plan_ayari RENAME CONSTRAINT plan_ayari_pkey TO plan_ayari_tekil;
ALTER TABLE plan_ayari RENAME CONSTRAINT plan_ayari_degistiren_kisi_id_fkey TO plan_ayari_degistiren;
ALTER TABLE plan_senaryo_ayari RENAME CONSTRAINT plan_senaryo_ayari_pkey TO plan_senaryo_ayari_tekil;
ALTER TABLE plan_senaryo_ayari RENAME CONSTRAINT plan_senaryo_ayari_senaryo_id_fkey TO plan_senaryo_ayari_senaryo;
