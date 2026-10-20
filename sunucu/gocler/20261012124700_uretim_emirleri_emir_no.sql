-- Emir no artık sunucuda kurulur ("Numara kuralları" ayarı; kart #802). Var olan numaralar değişmez:
-- DROP EXPRESSION hesaplanmış değeri satırda bırakır. Numara verilmeyen eklemede eski biçim tetikleyiciyle yazılır.
ALTER TABLE uretim_emri ALTER COLUMN emir_no DROP EXPRESSION;

CREATE FUNCTION uretim_emri_varsayilan_no() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.emir_no IS NULL THEN
    NEW.emir_no := 'UE-' || CASE WHEN NEW.id < 1000000 THEN lpad(NEW.id::text, 6, '0') ELSE NEW.id::text END;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER uretim_emri_varsayilan_no BEFORE INSERT ON uretim_emri FOR EACH ROW EXECUTE FUNCTION uretim_emri_varsayilan_no();

ALTER TABLE uretim_emri
  ALTER COLUMN emir_no SET NOT NULL,
  ADD CONSTRAINT uretim_emri_no_bicimi CHECK (btrim(emir_no) = emir_no AND emir_no <> '' AND length(emir_no) <= 120),
  -- Projeler modülü bağlanınca yabancı anahtar ayrı göçle gelir; eski emirde boş.
  ADD COLUMN proje_id int;

