-- 1105 a: sipariş verilince kalemin kart ayrıntısı (1104 a) sipariş satırına kopyalanır; kart sonra değişse de siparişte ne istendiği kalır.
-- Kartın o anki sürümü saklanır: güncel sürüm farklıysa ekran "kart değişti" der. Satır kapsamdan çıkıp silinince kopyası da gider.
-- Kopya yalnız eklenir, değişmez. Yeni ve boş tablo.
CREATE TABLE satin_alma_siparis_kart_kopyasi (
  siparis_satiri_id int PRIMARY KEY CONSTRAINT satin_alma_siparis_kart_kopyasi_satir REFERENCES satin_alma_siparis_satiri (id) ON DELETE CASCADE,
  malzeme_no int NOT NULL CONSTRAINT satin_alma_siparis_kart_kopyasi_malzeme REFERENCES malzeme_katalog_karti (no),
  kart_surumu int NOT NULL,
  ayrinti jsonb NOT NULL CONSTRAINT satin_alma_siparis_kart_kopyasi_ayrinti CHECK (jsonb_typeof(ayrinti) = 'object'),
  zaman timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER satin_alma_siparis_kart_kopyasi_yalniz_ekleme BEFORE UPDATE ON satin_alma_siparis_kart_kopyasi FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
