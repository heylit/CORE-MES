-- Hangi kaydın etiketinin hangi baskıda basıldığı (94 a): konum kodu değişince eski etiketi bulmak için izlenebilirlik.
-- Kaynak kimliği sahibi modülün tablosuna yabancı anahtarla bağlanmaz; bağlama aşamasında ayrı göçle gelir.
CREATE TABLE etiket_merkezi_baski_kaydi (
  baski_id int NOT NULL REFERENCES etiket_merkezi_baski,
  kaynak_tur text NOT NULL CONSTRAINT etiket_merkezi_baski_kaydi_tur CHECK (kaynak_tur IN ('konum')),
  kaynak_id int NOT NULL CONSTRAINT etiket_merkezi_baski_kaydi_id CHECK (kaynak_id > 0),
  PRIMARY KEY (baski_id, kaynak_tur, kaynak_id)
);
CREATE INDEX etiket_merkezi_baski_kaydi_kaynak ON etiket_merkezi_baski_kaydi (kaynak_tur, kaynak_id);
CREATE TRIGGER etiket_merkezi_baski_kaydi_degismez BEFORE UPDATE OR DELETE ON etiket_merkezi_baski_kaydi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
