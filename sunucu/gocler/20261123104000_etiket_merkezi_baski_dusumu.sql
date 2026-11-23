-- Basılmış sayılan ama çıkmamış etiket (3598): "Çıkmadı" işareti baskıyı Basılacaklar hesabından düşürür; baskı satırı değişmez.
-- Refakat kartı yeni basımlarda parti kimliğiyle yazılır (emir kimliği bir partinin basımıyla ötekileri düşürüyordu).
-- Yalnız eklenir: yeni tablo ve baskı kaydı tür listesine bir değer; var olan satırlar değişmez, silinmez.
CREATE TABLE etiket_merkezi_baski_dusumu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  baski_id int NOT NULL REFERENCES etiket_merkezi_baski,
  neden text NOT NULL CONSTRAINT etiket_merkezi_baski_dusumu_neden CHECK (neden IN ('usb-hatasi', 'cikmadi')),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT etiket_merkezi_baski_dusumu_tek UNIQUE (baski_id)
);
CREATE TRIGGER etiket_merkezi_baski_dusumu_degismez BEFORE UPDATE OR DELETE ON etiket_merkezi_baski_dusumu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();

ALTER TABLE etiket_merkezi_baski_kaydi DROP CONSTRAINT etiket_merkezi_baski_kaydi_tur,
  ADD CONSTRAINT etiket_merkezi_baski_kaydi_tur CHECK (kaynak_tur IN (
    'konum', 'raf', 'lot', 'istasyon', 'refakat', 'refakat-partisi', 'malzeme', 'kalite-durum', 'hatali-parca', 'sevk-koli'));
