-- Numune planı operasyonun gizli kimliğini de taşır (3250 b aşama 1); yalnız ekler. Yabancı anahtarı olmayan eski satır
-- eşleşmezse kimliksiz kalır ve sayılır, silinmez.
ALTER TABLE kalite_merkezi_numune_plani
  ADD COLUMN operasyon_id int CONSTRAINT kalite_merkezi_numune_plani_operasyon REFERENCES rota_op_numarasi (id);
UPDATE kalite_merkezi_numune_plani p SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = p.malzeme_no AND o.op_no = p.op_no;
CREATE INDEX kalite_merkezi_numune_plani_operasyon_idx ON kalite_merkezi_numune_plani (operasyon_id);
CREATE TRIGGER kalite_merkezi_numune_plani_operasyon BEFORE INSERT OR UPDATE OF malzeme_no, op_no ON kalite_merkezi_numune_plani
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_no', 'op_no', 'operasyon_id');
