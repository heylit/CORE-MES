-- Adım bağı, giren statüsü ve "OP n" statüsü operasyonun gizli kimliğini de taşır (3250 b aşama 1): op_no yeniden dizildiğinde
-- bağ numaradan değil kimlikten okunur. Bu göç yalnız ekler; hiçbir numara ve statü metni değişmez.
ALTER TABLE recete_rota_adim_bagi ADD COLUMN operasyon_id int CONSTRAINT recete_rota_adim_bagi_operasyon REFERENCES rota_op_numarasi (id);
ALTER TABLE recete_rota_giren_statusu
  ADD COLUMN operasyon_id int CONSTRAINT recete_rota_giren_statusu_operasyon REFERENCES rota_op_numarasi (id),
  ADD COLUMN giren_operasyon_id int CONSTRAINT recete_rota_giren_statusu_giren_operasyon REFERENCES rota_op_numarasi (id);
ALTER TABLE recete_rota_statu ADD COLUMN operasyon_id int CONSTRAINT recete_rota_statu_operasyon REFERENCES rota_op_numarasi (id);

UPDATE recete_rota_adim_bagi b SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = b.malzeme_id AND o.op_no = b.op_no;
UPDATE recete_rota_giren_statusu g SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = g.malzeme_id AND o.op_no = g.op_no;
UPDATE recete_rota_giren_statusu g SET giren_operasyon_id = o.id FROM rota_op_numarasi o
 WHERE o.malzeme_id = g.giren_malzeme_id AND o.op_no = g.giren_op_no;

-- Statünün kaynak adımı '<malzeme>-o<op>' metnidir; elle tanımlı ya da başka biçimli metin kimliksiz kalır.
CREATE FUNCTION recete_rota_statu_operasyonu() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p text[] := regexp_match(NEW.kaynak_adim, '^([0-9]{1,9})-o([0-9]{1,9})$');
BEGIN
  NEW.operasyon_id := CASE WHEN p IS NULL THEN NULL
    ELSE (SELECT o.id FROM rota_op_numarasi o WHERE o.malzeme_id = p[1]::int AND o.op_no = p[2]::int) END;
  RETURN NEW;
END $$;
UPDATE recete_rota_statu s SET operasyon_id = o.id
  FROM rota_op_numarasi o
 WHERE s.kaynak_adim ~ '^[0-9]{1,9}-o[0-9]{1,9}$'
   AND o.malzeme_id = (regexp_match(s.kaynak_adim, '^([0-9]+)-o'))[1]::int
   AND o.op_no = (regexp_match(s.kaynak_adim, '-o([0-9]+)$'))[1]::int;

CREATE INDEX recete_rota_adim_bagi_operasyon_idx ON recete_rota_adim_bagi (operasyon_id);
CREATE INDEX recete_rota_giren_statusu_operasyon_idx ON recete_rota_giren_statusu (operasyon_id);
CREATE INDEX recete_rota_statu_operasyon_idx ON recete_rota_statu (operasyon_id);

CREATE TRIGGER recete_rota_adim_bagi_operasyon BEFORE INSERT OR UPDATE OF malzeme_id, op_no ON recete_rota_adim_bagi
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_id', 'op_no', 'operasyon_id');
CREATE TRIGGER recete_rota_giren_statusu_operasyon BEFORE INSERT OR UPDATE OF malzeme_id, op_no ON recete_rota_giren_statusu
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_id', 'op_no', 'operasyon_id');
CREATE TRIGGER recete_rota_giren_statusu_giren_operasyon BEFORE INSERT OR UPDATE OF giren_malzeme_id, giren_op_no ON recete_rota_giren_statusu
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('giren_malzeme_id', 'giren_op_no', 'giren_operasyon_id');
CREATE TRIGGER recete_rota_statu_operasyon BEFORE INSERT OR UPDATE OF kaynak_adim ON recete_rota_statu
  FOR EACH ROW EXECUTE FUNCTION recete_rota_statu_operasyonu();
