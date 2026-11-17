-- SmartES'te tek atölye istasyonu vardır; CORE'un birden çok istasyonu aynı SmartES iş istasyonu koduna eşlenebilmelidir.
-- Öteki türlerde (makine, operasyon tipi, duruş nedeni) kod yine tek kayda verilir.
ALTER TABLE smartes_esleme DROP CONSTRAINT smartes_esleme_kod_tekil;
CREATE UNIQUE INDEX smartes_esleme_kod_tekil ON smartes_esleme (tur, smartes_kod) WHERE tur <> 'istasyon';
