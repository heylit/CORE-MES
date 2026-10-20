-- Emir sipariş satırına bağlanır (kullanıcı kararı 176 a, dolu tablo göçü onaylı): sipariş, proje, emir zinciri. Boş olabilir;
-- var olan emirler boş kalır, veri doldurulmaz. Satırın projenin siparişine ait olması servis kuralıdır (sipariş ve proje başka modülde).
ALTER TABLE uretim_emri
  ADD COLUMN siparis_satiri_id int CONSTRAINT uretim_emri_siparis_satiri REFERENCES siparisler_siparis_satiri (id);
CREATE INDEX uretim_emri_siparis_satiri_dizini ON uretim_emri (siparis_satiri_id) WHERE siparis_satiri_id IS NOT NULL;
