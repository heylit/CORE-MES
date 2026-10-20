-- Emrin proje bağı projeler modülüne yabancı anahtarla bağlanır (kart #802); proje silinmez (yalnız iptal), bağ kalıcıdır.
ALTER TABLE uretim_emri ADD CONSTRAINT uretim_emri_proje FOREIGN KEY (proje_id) REFERENCES projeler_proje (id);
