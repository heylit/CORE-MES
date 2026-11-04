-- 1846 (TKV-2 a): vergi son gününün beyanı verildi mi. Son günler kuraldan üretilir (kurallar.ts vergiTakvimi), yalnız "verildi"
-- işareti saklanır; satır yoksa beyan verilmemiştir. İşaret kaldırılınca satır silinir (kim, ne zaman: denetim kaydı).
CREATE TABLE finans_vergi_beyani (
  son_gun date NOT NULL,
  kod text NOT NULL CONSTRAINT finans_vergi_beyani_kod CHECK (kod IN ('kdv-tevkifat', 'muhtasar', 'kdv', 'gecici-vergi', 'kurumlar-vergisi', 'gelir-vergisi')),
  isaretleyen_id int NOT NULL REFERENCES kisi (id),
  isaretleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (son_gun, kod)
);
