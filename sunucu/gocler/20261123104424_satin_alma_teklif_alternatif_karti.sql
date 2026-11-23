-- 3593 (Risk S3): teklif satırındaki alternatif bir alternatif kartına (kalemde işaretli set) dayanabilir. Kayıt anında kartın çözülmüş
-- sınırı (nitelikler ve ana kartın o anki değerleri) satıra dondurulur; set ya da ana kart sonra değişse de teklif bununla denetlenir.
--   alternatif_seti_id: dayanılan alternatif kartı; set silinince boşalır, dondurulan sınır kalır.
--   alternatif_siniri: dondurulan sınır ({ad, tur, ozet, nitelikler, ana}).
-- İşlem alternatif jsonb'sindedir (islem); eski satırda yoktur, ana kartın işlemi sayılır. Yalnız boş sütun eklenir; var olan satır değişmez.
ALTER TABLE satin_alma_teklif_satiri
  ADD COLUMN alternatif_seti_id int CONSTRAINT satin_alma_teklif_satiri_alternatif_seti REFERENCES malzeme_alternatif_seti (id) ON DELETE SET NULL,
  ADD COLUMN alternatif_siniri jsonb CONSTRAINT satin_alma_teklif_satiri_alternatif_siniri CHECK (jsonb_typeof(alternatif_siniri) = 'object'),
  ADD CONSTRAINT satin_alma_teklif_satiri_alternatif_sinirli CHECK ((alternatif_seti_id IS NULL AND alternatif_siniri IS NULL) OR alternatif IS NOT NULL),
  ADD CONSTRAINT satin_alma_teklif_satiri_alternatif_seti_sinirli CHECK (alternatif_seti_id IS NULL OR alternatif_siniri IS NOT NULL);
CREATE INDEX satin_alma_teklif_satiri_alternatif_seti_idx ON satin_alma_teklif_satiri (alternatif_seti_id) WHERE alternatif_seti_id IS NOT NULL;
