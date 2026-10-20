-- Sayım süresi (gün): dolu raf gözü bu süreden uzun sayılmadıysa "sayım bekleyen" olur (DEP-15). Sistem Ayarları sayı
-- türü gelene kadar deponun yerleşiminde tutulur; varsayılan önizlemedeki gibi 30 gün.
ALTER TABLE stok_depo_yerlesimi ADD COLUMN sayim_suresi_gun smallint NOT NULL DEFAULT 30
  CONSTRAINT stok_depo_yerlesimi_sayim_suresi CHECK (sayim_suresi_gun BETWEEN 1 AND 365);
