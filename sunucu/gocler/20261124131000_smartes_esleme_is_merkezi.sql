-- SmartES'te CORE'un talaşlı imalat iş merkezi altındaki Torna ve Freze tek istasyondur: iş merkezi SmartES istasyon koduyla eşlenebilir.
-- Yalnız kısıt değişir, hiçbir satır okunmaz ya da yazılmaz. Birden çok CORE iş merkezi aynı SmartES kodunu taşıyabilir (istasyondaki gibi).
ALTER TABLE smartes_esleme DROP CONSTRAINT smartes_esleme_tur;
ALTER TABLE smartes_esleme ADD CONSTRAINT smartes_esleme_tur CHECK (tur IN ('istasyon', 'is-merkezi', 'makine', 'operasyon-tipi', 'durus-nedeni'));

DROP INDEX smartes_esleme_kod_tekil;
CREATE UNIQUE INDEX smartes_esleme_kod_tekil ON smartes_esleme (tur, smartes_kod) WHERE tur NOT IN ('istasyon', 'is-merkezi');
