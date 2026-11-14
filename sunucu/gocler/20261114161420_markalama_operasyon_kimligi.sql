-- Markalama tanımı operasyonun gizli kimliğini de taşır (3250 b aşama 1); yalnız ekler. Eşleşmeyen eski satır kimliksiz kalır.
ALTER TABLE markalama_tanimi ADD COLUMN operasyon_id int CONSTRAINT markalama_tanimi_operasyon REFERENCES rota_op_numarasi (id);
UPDATE markalama_tanimi m SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = m.malzeme_id AND o.op_no = m.op_no;
CREATE INDEX markalama_tanimi_operasyon_idx ON markalama_tanimi (operasyon_id);
CREATE TRIGGER markalama_tanimi_operasyon BEFORE INSERT OR UPDATE OF malzeme_id, op_no ON markalama_tanimi
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_id', 'op_no', 'operasyon_id');
