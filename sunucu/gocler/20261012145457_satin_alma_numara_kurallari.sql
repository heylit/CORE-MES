-- Talep, sipariş ve katalog numaraları "Numara kuralları" ayarından gelir (ayarlar numaraAl). Var olan numaralar
-- değişmez: DROP EXPRESSION hesaplanmış değeri satırda bırakır. Talep ve sipariş numarası Logo fiş numarası olur
-- (en çok 16 karakter). Eski yıl ve sıra sütunları ile yıllık sayaçlar eski kayıtlar için kalır, yenisine yazılmaz.
ALTER TABLE satin_alma_talep ALTER COLUMN no DROP EXPRESSION;

-- Numarasız, yıl ve sıralı eklemede (eski yazım) numara eski biçimle yazılır; ikisi de yoksa NOT NULL durdurur.
CREATE FUNCTION satin_alma_talep_varsayilan_no() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.no IS NULL AND NEW.yil IS NOT NULL AND NEW.sira IS NOT NULL THEN
    NEW.no := 'ST-' || NEW.yil::text || '-' || CASE WHEN NEW.sira < 1000 THEN lpad(NEW.sira::text, 3, '0') ELSE NEW.sira::text END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER satin_alma_talep_varsayilan_no BEFORE INSERT ON satin_alma_talep FOR EACH ROW EXECUTE FUNCTION satin_alma_talep_varsayilan_no();
ALTER TABLE satin_alma_talep
  ALTER COLUMN no SET NOT NULL,
  ALTER COLUMN yil DROP NOT NULL,
  ALTER COLUMN sira DROP NOT NULL,
  ADD CONSTRAINT satin_alma_talep_no_bicim CHECK (btrim(no) = no AND no <> '' AND length(no) <= 16),
  ADD CONSTRAINT satin_alma_talep_no_tek UNIQUE (no);

ALTER TABLE satin_alma_siparis
  DROP CONSTRAINT satin_alma_siparis_no_bicim,
  ADD CONSTRAINT satin_alma_siparis_no_bicim CHECK (btrim(no) = no AND no <> '' AND length(no) <= 16);

ALTER TABLE satin_alma_katalog
  DROP CONSTRAINT satin_alma_katalog_kod,
  ADD CONSTRAINT satin_alma_katalog_kod CHECK (btrim(kod) = kod AND kod <> '' AND length(kod) <= 40);
