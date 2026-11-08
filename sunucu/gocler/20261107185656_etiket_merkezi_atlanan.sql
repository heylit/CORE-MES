-- Basılacaklar listesinde "basılmayacak" işareti (2223-4 a). Bekleyen etiket kaynak kayıttan türetilir (2223-1 a); işaret, o andan önceki
-- olayı listeden düşürür. Kayıt sonra yeniden değişirse (kalite durumu) yeniden bekler. Yalnız eklenir; dolu tabloya dokunmaz.
-- Tür listesi depodan emre veriliş (refakat kartı) ve hatalı parçayı da kapsar (2223-2 a): o türler gelince CHECK değişmesin.
-- Kaynak kimliği sahibi modülün tablosuna yabancı anahtarla bağlanmaz (baskı kaydı gibi).
CREATE TABLE etiket_merkezi_atlanan (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT etiket_merkezi_atlanan_tur CHECK (tur IN ('mal-kabul', 'kalite-durum', 'refakat-partisi', 'hatali-parca')),
  kaynak_id int NOT NULL CONSTRAINT etiket_merkezi_atlanan_id CHECK (kaynak_id > 0),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX etiket_merkezi_atlanan_kaynak ON etiket_merkezi_atlanan (tur, kaynak_id);
CREATE TRIGGER etiket_merkezi_atlanan_degismez BEFORE UPDATE OR DELETE ON etiket_merkezi_atlanan
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
