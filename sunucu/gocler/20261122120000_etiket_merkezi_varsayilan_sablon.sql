-- 3544 (3561 b): tür ve boy başına varsayılan yerleşim; boy şerit şablonun anahtarıyla (taban) söylenir. Defter yalnız eklenir; tabanın en son satırı etkindir, satır yoksa şeridin kendisi geçerlidir.
CREATE TABLE etiket_merkezi_varsayilan_sablon (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sablon_taban text NOT NULL CONSTRAINT etiket_merkezi_varsayilan_sablon_taban CHECK (sablon_taban ~ '^[a-z0-9-]{1,40}$'),
  sablon_anahtar text NOT NULL CONSTRAINT etiket_merkezi_varsayilan_sablon_anahtar CHECK (sablon_anahtar ~ '^[a-z0-9-]{1,40}$'),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX etiket_merkezi_varsayilan_sablon_son ON etiket_merkezi_varsayilan_sablon (sablon_taban, id);
CREATE TRIGGER etiket_merkezi_varsayilan_sablon_degismez BEFORE UPDATE OR DELETE ON etiket_merkezi_varsayilan_sablon
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
