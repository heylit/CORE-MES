-- 3760 karar 8 a: üretim olayı yalnız eklenen defterdir; sonradan eşlenen duruş nedeni (ve yanlış eşlenmiş kişi) ayrı düzeltme kaydıyla yazılır.
-- Raporlar olayı düzeltmeleriyle okur (uretim_olayi_gecerli): her alan için en son düzeltme geçerlidir. Var olan satır değişmez.
CREATE TABLE uretim_olayi_duzeltmesi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  olay_id int NOT NULL REFERENCES uretim_olayi,
  durus_nedeni_id int REFERENCES durus_nedeni,
  kisi_id int REFERENCES kisi,
  gerekce text NOT NULL CONSTRAINT uretim_olayi_duzeltmesi_gerekce CHECK (btrim(gerekce) <> '' AND length(gerekce) <= 500),
  yazan_kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uretim_olayi_duzeltmesi_bos_degil CHECK (durus_nedeni_id IS NOT NULL OR kisi_id IS NOT NULL)
);
CREATE INDEX uretim_olayi_duzeltmesi_olay ON uretim_olayi_duzeltmesi (olay_id, id);
CREATE TRIGGER uretim_olayi_duzeltmesi_degismez BEFORE UPDATE OR DELETE ON uretim_olayi_duzeltmesi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_olayi_duzeltmesi_bosaltilmaz BEFORE TRUNCATE ON uretim_olayi_duzeltmesi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE VIEW uretim_olayi_gecerli AS
  SELECT o.id, o.emir_id, coalesce(k.kisi_id, o.kisi_id) AS kisi_id, o.istasyon_id, o.olay,
         coalesce(n.durus_nedeni_id, o.durus_nedeni_id) AS durus_nedeni_id, o.zaman, o.is_emri_id
    FROM uretim_olayi o
    LEFT JOIN LATERAL (SELECT d.durus_nedeni_id FROM uretim_olayi_duzeltmesi d WHERE d.olay_id = o.id AND d.durus_nedeni_id IS NOT NULL ORDER BY d.id DESC LIMIT 1) n ON true
    LEFT JOIN LATERAL (SELECT d.kisi_id FROM uretim_olayi_duzeltmesi d WHERE d.olay_id = o.id AND d.kisi_id IS NOT NULL ORDER BY d.id DESC LIMIT 1) k ON true;
