-- Operasyon tipinin sahibi istasyonlar kataloğudur (RT2 a, RG1 a); adım tipi kataloğa bağlanır. Kataloğa bağlanamayan adım varsa göç hiçbir şeyi değiştirmeden durur.
DO $$
DECLARE
  adet int;
  ornek text;
BEGIN
  SELECT count(*), string_agg(DISTINCT a.operasyon_tipi_id::text, ', ')
    INTO adet, ornek
    FROM rota_adimi a
    WHERE NOT EXISTS (SELECT 1 FROM istasyonlar_operasyon_tipi t WHERE t.id = a.operasyon_tipi_id);
  IF adet > 0 THEN
    RAISE EXCEPTION 'Rota adımlarından % tanesinin operasyon tipi istasyonlar kataloğunda yok (tip kimlikleri: %); göç durdu, hiçbir şey değişmedi.', adet, ornek;
  END IF;
END $$;

ALTER TABLE rota_adimi
  ADD CONSTRAINT rota_adimi_operasyon_tipi_bagi FOREIGN KEY (operasyon_tipi_id) REFERENCES istasyonlar_operasyon_tipi (id);
