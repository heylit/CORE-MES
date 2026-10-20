-- Adım ve aday kaynağın istasyonu istasyonlar modülünün kaydıdır (kart #1184).
ALTER TABLE rota_adimi ADD CONSTRAINT rota_adimi_istasyon_var FOREIGN KEY (istasyon_id) REFERENCES istasyon (id);
ALTER TABLE rota_aday_kaynagi ADD CONSTRAINT rota_aday_kaynagi_istasyon_var FOREIGN KEY (istasyon_id) REFERENCES istasyon (id);
