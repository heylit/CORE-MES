-- Kalite Merkezi'nin kayıtları. Uygulama değiştirilmeden çalıştığı için kayıtlar onun biçiminde (jsonb) saklanır (Arkon kalıbı);
-- öteki ekranlar değişikliği tek, hep artan sürümle okur. Silinen kaydın satırı gövdesiz kalır: silindiği akışta görünür.

CREATE SEQUENCE kalite_merkezi_surum AS bigint;

CREATE TABLE kalite_merkezi_belge (
  koleksiyon text NOT NULL CONSTRAINT kalite_merkezi_belge_koleksiyon_degeri CHECK (koleksiyon IN (
    'ncr', 'capa', 'insp', 'dev', 'sup', 'frm', 'lot', 'tpl', 'spc', 'cizim', 'parca', 'kullanici', 'iz', 'belge', 'emir', 'bayrak',
    'settings')),
  kimlik text NOT NULL CONSTRAINT kalite_merkezi_belge_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_.:@+~|-]{1,200}$'),
  govde jsonb CONSTRAINT kalite_merkezi_belge_govde_nesne CHECK (govde IS NULL OR jsonb_typeof(govde) = 'object'),
  surum bigint NOT NULL DEFAULT nextval('kalite_merkezi_surum'),
  degistiren_id int NOT NULL REFERENCES kisi,
  degisti timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (koleksiyon, kimlik)
);
CREATE UNIQUE INDEX kalite_merkezi_belge_surum_idx ON kalite_merkezi_belge (surum);

-- Değişiklik izi kaydı yazıldıktan sonra değişmez ve silinmez (uygulamanın yerel sunucusundaki kural); servis önce reddeder,
-- tetikleyici başka yoldan gelen yazmayı da durdurur.
CREATE FUNCTION kalite_merkezi_iz_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.koleksiyon = 'iz' AND OLD.govde IS NOT NULL THEN
    RAISE EXCEPTION 'Kalite Merkezi değişiklik izi kaydı değiştirilemez: %', OLD.kimlik;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER kalite_merkezi_belge_iz_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_belge
  FOR EACH ROW EXECUTE FUNCTION kalite_merkezi_iz_degismez();
