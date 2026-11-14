-- OP numarası yeniden dizilebilsin diye (3250 b) operasyonun gizli, sayı olmayan kimliği açılır. Bu göç yalnız ekler: hiçbir
-- op_no değişmez; kimlik eski (malzeme, op_no) çiftinden doldurulur ve yazanlar değişmeden tetikleyiciyle dolu tutulur.
ALTER TABLE rota_op_numarasi ADD COLUMN id int GENERATED ALWAYS AS IDENTITY;
ALTER TABLE rota_op_numarasi ADD CONSTRAINT rota_op_numarasi_kimlik_tekil UNIQUE (id);
ALTER TABLE rota_op_numarasi ALTER COLUMN id SET NOT NULL;

-- Tetikleyici bağımsız değişkenleri: malzeme sütunu, op sütunu, yazılacak kimlik sütunu. Eşleşme yoksa kimlik boş kalır
-- (yabancı anahtarı olmayan tablolarda yetim satır olabilir; sessizce başka operasyona bağlanmaz).
CREATE FUNCTION rota_operasyon_kimligi_doldur() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  satir jsonb := to_jsonb(NEW);
  kimlik int;
BEGIN
  SELECT o.id INTO kimlik FROM rota_op_numarasi o
   WHERE o.malzeme_id = (satir ->> TG_ARGV[0])::int AND o.op_no = (satir ->> TG_ARGV[1])::int;
  NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[2], kimlik));
  RETURN NEW;
END $$;

ALTER TABLE rota_adimi ADD COLUMN operasyon_id int CONSTRAINT rota_adimi_operasyon REFERENCES rota_op_numarasi (id);
ALTER TABLE rota_talimati ADD COLUMN operasyon_id int CONSTRAINT rota_talimati_operasyon REFERENCES rota_op_numarasi (id);
ALTER TABLE rota_talimat_taslagi ADD COLUMN operasyon_id int CONSTRAINT rota_talimat_taslagi_operasyon REFERENCES rota_op_numarasi (id);
ALTER TABLE rota_talimat_sahnesi ADD COLUMN operasyon_id int CONSTRAINT rota_talimat_sahnesi_operasyon REFERENCES rota_op_numarasi (id);
ALTER TABLE rota_gerceklesen_sure ADD COLUMN operasyon_id int CONSTRAINT rota_gerceklesen_sure_operasyon REFERENCES rota_op_numarasi (id);

-- İlk dolum: içerik kilidi ve yalnız ekleme kilitleri yalnız bu dolum için göçün işlemi içinde kapatılıp açılır.
ALTER TABLE rota_adimi DISABLE TRIGGER rota_adimi_kilitli;
UPDATE rota_adimi a SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = a.malzeme_id AND o.op_no = a.op_no;
ALTER TABLE rota_adimi ENABLE TRIGGER rota_adimi_kilitli;
ALTER TABLE rota_talimati DISABLE TRIGGER rota_talimati_degismez;
UPDATE rota_talimati t SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = t.malzeme_id AND o.op_no = t.op_no;
ALTER TABLE rota_talimati ENABLE TRIGGER rota_talimati_degismez;
UPDATE rota_talimat_taslagi t SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = t.malzeme_id AND o.op_no = t.op_no;
ALTER TABLE rota_talimat_sahnesi DISABLE TRIGGER rota_talimat_sahnesi_degismez;
UPDATE rota_talimat_sahnesi t SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = t.malzeme_id AND o.op_no = t.op_no;
ALTER TABLE rota_talimat_sahnesi ENABLE TRIGGER rota_talimat_sahnesi_degismez;
ALTER TABLE rota_gerceklesen_sure DISABLE TRIGGER rota_gerceklesen_sure_degismez;
UPDATE rota_gerceklesen_sure t SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = t.malzeme_id AND o.op_no = t.op_no;
ALTER TABLE rota_gerceklesen_sure ENABLE TRIGGER rota_gerceklesen_sure_degismez;

-- Bu tablolarda (malzeme, op_no) yabancı anahtarla kayıtlıdır: kimlik her satırda dolu olur.
ALTER TABLE rota_adimi ALTER COLUMN operasyon_id SET NOT NULL;
ALTER TABLE rota_talimati ALTER COLUMN operasyon_id SET NOT NULL;
ALTER TABLE rota_talimat_taslagi ALTER COLUMN operasyon_id SET NOT NULL;
ALTER TABLE rota_talimat_sahnesi ALTER COLUMN operasyon_id SET NOT NULL;
ALTER TABLE rota_gerceklesen_sure ALTER COLUMN operasyon_id SET NOT NULL;
ALTER TABLE rota_adimi ADD CONSTRAINT rota_adimi_operasyon_tekil UNIQUE (revizyon_id, operasyon_id);
CREATE INDEX rota_talimati_operasyon_idx ON rota_talimati (operasyon_id, surum);
CREATE INDEX rota_talimat_taslagi_operasyon_idx ON rota_talimat_taslagi (operasyon_id);
CREATE INDEX rota_talimat_sahnesi_operasyon_idx ON rota_talimat_sahnesi (operasyon_id);
CREATE INDEX rota_gerceklesen_sure_operasyon_idx ON rota_gerceklesen_sure (operasyon_id, tur, id);

CREATE TRIGGER rota_adimi_operasyon BEFORE INSERT OR UPDATE OF malzeme_id, op_no ON rota_adimi
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_id', 'op_no', 'operasyon_id');
CREATE TRIGGER rota_talimati_operasyon BEFORE INSERT ON rota_talimati
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_id', 'op_no', 'operasyon_id');
CREATE TRIGGER rota_talimat_taslagi_operasyon BEFORE INSERT OR UPDATE OF malzeme_id, op_no ON rota_talimat_taslagi
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_id', 'op_no', 'operasyon_id');
CREATE TRIGGER rota_talimat_sahnesi_operasyon BEFORE INSERT ON rota_talimat_sahnesi
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_id', 'op_no', 'operasyon_id');
CREATE TRIGGER rota_gerceklesen_sure_operasyon BEFORE INSERT ON rota_gerceklesen_sure
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_id', 'op_no', 'operasyon_id');
