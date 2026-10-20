-- Teslim satın almada tutulur (kullanıcı kararı SH1 a, kart #162): stok mal kabul işleminin içinde satın almanın teslimIsle
-- fonksiyonunu çağırır. Kayıt yalnız eklenir; mal kabul düzeltilince aynı mal kabul satırına ters (eksi) kayıt eklenir.
-- Kalanı aşan teslim reddedilmez; sipariş satırında fazla teslim olarak görünür (kullanıcı kararı, 09.10.2026).
-- Yeni tablodur, dolu tabloya dokunmaz.
CREATE TABLE satin_alma_teslim (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  siparis_satiri_id integer NOT NULL CONSTRAINT satin_alma_teslim_siparis_satiri REFERENCES satin_alma_siparis_satiri,
  -- Stokun mal kabul satırı; yön stok -> satın alma olduğu için yabancı anahtar stok tarafındadır (stok_mal_kabul_satiri.siparis_satir_id).
  mal_kabul_satiri_id bigint NOT NULL,
  miktar numeric(18,4) NOT NULL CONSTRAINT satin_alma_teslim_miktar CHECK (miktar <> 0),
  zaman timestamptz NOT NULL DEFAULT now(),
  kisi_id integer NOT NULL CONSTRAINT satin_alma_teslim_kisi REFERENCES kisi (id)
);
CREATE INDEX satin_alma_teslim_siparis_satiri_dizin ON satin_alma_teslim (siparis_satiri_id);
CREATE INDEX satin_alma_teslim_mal_kabul_dizin ON satin_alma_teslim (mal_kabul_satiri_id);
CREATE TRIGGER satin_alma_teslim_yalniz_ekleme BEFORE UPDATE OR DELETE ON satin_alma_teslim FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
