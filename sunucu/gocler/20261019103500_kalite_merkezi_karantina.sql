-- Uygunsuzluk kaydının stokta red yaptığı her hareket (229 a): hangi NCR'nin hangi bakiyeyi karantinaya aldığı buradan okunur,
-- karar (Faz C) aynı hareketleri geri çevirir. Parti, konum, statü ve miktar hareketin kendisindedir; burada tekrar tutulmaz.
CREATE TABLE kalite_merkezi_karantina (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ncr_kimlik text NOT NULL CONSTRAINT kalite_merkezi_karantina_kimlik_bicimi CHECK (ncr_kimlik ~ '^[A-Za-z0-9_.:@+~|-]{1,200}$'),
  stok_hareketi_id bigint NOT NULL CONSTRAINT kalite_merkezi_karantina_hareket_tek UNIQUE
    CONSTRAINT kalite_merkezi_karantina_hareket_var REFERENCES stok_hareketi (id),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kalite_merkezi_karantina_ncr ON kalite_merkezi_karantina (ncr_kimlik);

CREATE TRIGGER kalite_merkezi_karantina_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_karantina
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalite_merkezi_karantina_bosaltilmaz BEFORE TRUNCATE ON kalite_merkezi_karantina
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
