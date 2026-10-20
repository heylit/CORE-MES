-- Katalog ekrandan düzenlenir; iki kişi aynı tipi aynı anda düzenlerse sonra yazan öncekini sessizce ezmesin (IS13).
-- Tohum satırları 1 ile başlar; satır silinmez, değeri değişmez.
ALTER TABLE istasyonlar_operasyon_tipi
  ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT istasyonlar_operasyon_tipi_surum_pozitif CHECK (surum > 0);
