-- Reçete ve Rota adımı istasyona bağlar (kart #1184, kullanıcı kararı 14.10.2026): adımın ve aday kaynağın kaynağı istasyon da olabilir. Var olan satırlar değişmez.
ALTER TABLE rota_adimi
  ADD COLUMN istasyon_id int,
  DROP CONSTRAINT rota_adimi_tek_kaynak,
  ADD CONSTRAINT rota_adimi_tek_kaynak CHECK (num_nonnulls(makine_id, kisi_id, fason_firma_id, istasyon_id) <= 1);

ALTER TABLE rota_aday_kaynagi
  ADD COLUMN istasyon_id int,
  DROP CONSTRAINT rota_aday_kaynagi_tek_kaynak,
  ADD CONSTRAINT rota_aday_kaynagi_tek_kaynak CHECK (num_nonnulls(makine_id, kisi_id, istasyon_id) = 1),
  ADD CONSTRAINT rota_aday_kaynagi_istasyon_tekil UNIQUE (adim_id, istasyon_id);
