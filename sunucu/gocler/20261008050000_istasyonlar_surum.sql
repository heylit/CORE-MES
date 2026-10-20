-- Tesis kaydını iki kişi aynı anda düzenleyebilir; sonra yazan öncekini sessizce ezmesin (IS9). Eski satırlar 1 ile başlar.
ALTER TABLE is_merkezi ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT is_merkezi_surum_pozitif CHECK (surum > 0);
ALTER TABLE istasyon ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT istasyon_surum_pozitif CHECK (surum > 0);
ALTER TABLE makine ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT makine_surum_pozitif CHECK (surum > 0);
