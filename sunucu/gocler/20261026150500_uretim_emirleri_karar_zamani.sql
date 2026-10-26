-- Kalite kararının satırları sayımın üretildiği ana yazılır (645 a, 652 a): üretim ölçüleri (OEE, günlük sayım) parçayı üretildiği
-- güne sayar. Kararın verildiği an bu sütundadır; defter ve son olaylar kararı bu anda gösterir.
-- Boş: karar satırı değil ya da bu sütundan önce yazılmış karar satırı (zamanı karar anıdır). Var olan satırlar değişmez.
ALTER TABLE uretim_sayimi ADD COLUMN karar_zamani timestamptz;
ALTER TABLE uretim_sayimi ADD CONSTRAINT uretim_sayimi_karar_zamani_kararda
  CHECK (karar_zamani IS NULL OR karar_veren_kisi_id IS NOT NULL);
-- Son olaylar akışı kararları karar anına göre süzer.
CREATE INDEX uretim_sayimi_karar_zamani_idx ON uretim_sayimi (karar_zamani) WHERE karar_zamani IS NOT NULL;
