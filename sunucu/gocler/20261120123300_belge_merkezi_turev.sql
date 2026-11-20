-- Çizim türevi (kart 3468-2, 3468 a): düzenlenmiş PDF ayrı belgedir (2123-2 b) ama orijinalin hangi revizyonundan çıktığını ve
-- hangi iş için hazırlandığını (kullanım) taşır. Var olan satırlar orijinaldir (üç sütun boş); yalnız ekleyen göç.

-- Türevin kaynak revizyonu kaynak belgeye ait olmalı: revizyon (id, belge_id) ikilisiyle anılır.
ALTER TABLE belge_merkezi_revizyon ADD CONSTRAINT belge_merkezi_revizyon_belge_kimligi UNIQUE (id, belge_id);

ALTER TABLE belge_merkezi_belge
  ADD COLUMN kaynak_belge_id int,
  ADD COLUMN kaynak_revizyon_id int,
  ADD COLUMN kullanim text,
  ADD CONSTRAINT belge_merkezi_belge_kaynak_fk FOREIGN KEY (kaynak_revizyon_id, kaynak_belge_id)
    REFERENCES belge_merkezi_revizyon (id, belge_id),
  ADD CONSTRAINT belge_merkezi_belge_turev_butun CHECK (
    (kaynak_belge_id IS NULL) = (kaynak_revizyon_id IS NULL) AND (kaynak_belge_id IS NULL) = (kullanim IS NULL)),
  ADD CONSTRAINT belge_merkezi_belge_kullanim_degeri CHECK (
    kullanim IS NULL OR kullanim IN ('ic-uretim', 'dis-uretim', 'dis-operasyon', 'kalite', 'teklif', 'diger')),
  ADD CONSTRAINT belge_merkezi_belge_kendi_turevi_degil CHECK (kaynak_belge_id IS NULL OR kaynak_belge_id <> id);

CREATE INDEX belge_merkezi_belge_kaynak_idx ON belge_merkezi_belge (kaynak_belge_id, id) WHERE kaynak_belge_id IS NOT NULL;
CREATE INDEX belge_merkezi_belge_kaynak_revizyon_idx ON belge_merkezi_belge (kaynak_revizyon_id) WHERE kaynak_revizyon_id IS NOT NULL;

-- Tek seviye: türevin kaynağı türev olamaz; türevi olan belge türev olamaz. Eşzamanlı iki bağ birbirini görmesin diye ilgili
-- belgeler kilitlenir (servis de kilitler; tetikleyici son savunmadır).
CREATE FUNCTION belge_merkezi_turev_tek_seviye() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kaynak_belge_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.kaynak_belge_id IS NOT DISTINCT FROM OLD.kaynak_belge_id THEN RETURN NEW; END IF;
  PERFORM 1 FROM belge_merkezi_belge WHERE id = NEW.kaynak_belge_id AND kaynak_belge_id IS NOT NULL FOR SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'Türevin türevi olmaz' USING ERRCODE = 'check_violation', CONSTRAINT = 'belge_merkezi_turev_tek_seviye';
  END IF;
  PERFORM 1 FROM belge_merkezi_belge WHERE kaynak_belge_id = NEW.id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Türevi olan belge türev olamaz' USING ERRCODE = 'check_violation', CONSTRAINT = 'belge_merkezi_turev_tek_seviye';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER belge_merkezi_turev_tek_seviye BEFORE INSERT OR UPDATE OF kaynak_belge_id ON belge_merkezi_belge
  FOR EACH ROW EXECUTE FUNCTION belge_merkezi_turev_tek_seviye();
