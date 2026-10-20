-- Sipariş -> proje -> üretim emri zinciri (176 a): proje açıldığı siparişe bağlanır. Boş olabilir; var olan projeler boş kalır.
ALTER TABLE projeler_proje
  ADD COLUMN siparis_id int CONSTRAINT projeler_proje_siparis REFERENCES siparisler_siparis (id);

CREATE INDEX projeler_proje_siparis_dizini ON projeler_proje (siparis_id, id) WHERE siparis_id IS NOT NULL;

-- Bağ açılışta kurulur ve değişmez (PRJ-07): siparişin projeleri ve projeden açılan emirler aynı siparişe işaret etmeli.
CREATE FUNCTION projeler_proje_siparis_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.siparis_id IS DISTINCT FROM OLD.siparis_id THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'projeler_proje_siparis_degismez',
      MESSAGE = 'Projenin bağlı olduğu sipariş değişmez.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER projeler_proje_siparis_degismez BEFORE UPDATE ON projeler_proje
  FOR EACH ROW EXECUTE FUNCTION projeler_proje_siparis_degismez();
