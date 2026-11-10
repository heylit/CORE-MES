-- 2642 b: fatura (finans_belge) tutarının sipariş satırlarına eşlemesi; sahibi satın alma (Mimar, kat 8 -> kat 4 başvurusu).
-- Tutar belgenin para biriminde, KDV hariç. Kayıt silinmez; kaldırılınca kaldıran ve zaman bir kez yazılır (Veri 3).
CREATE TABLE satin_alma_fatura_eslemesi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  belge_id int NOT NULL CONSTRAINT satin_alma_fatura_eslemesi_belge REFERENCES finans_belge (id),
  -- Veri 2: eşlemesi (kaldırılmış olsa da) olan satır siparişten çıkarılamaz.
  siparis_satiri_id int NOT NULL CONSTRAINT satin_alma_fatura_eslemesi_satir REFERENCES satin_alma_siparis_satiri (id) ON DELETE RESTRICT,
  tutar numeric(18, 2) NOT NULL CONSTRAINT satin_alma_fatura_eslemesi_tutar CHECK (tutar > 0),
  ekleyen_kisi_id int NOT NULL CONSTRAINT satin_alma_fatura_eslemesi_ekleyen REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  kaldiran_kisi_id int CONSTRAINT satin_alma_fatura_eslemesi_kaldiran REFERENCES kisi (id),
  kaldirilma timestamptz,
  CONSTRAINT satin_alma_fatura_eslemesi_kaldirma_butun CHECK ((kaldiran_kisi_id IS NULL) = (kaldirilma IS NULL))
);
CREATE UNIQUE INDEX satin_alma_fatura_eslemesi_etkin_tek ON satin_alma_fatura_eslemesi (belge_id, siparis_satiri_id) WHERE kaldirilma IS NULL;
CREATE INDEX satin_alma_fatura_eslemesi_satir_idx ON satin_alma_fatura_eslemesi (siparis_satiri_id);

-- Güncellemede yalnız kaldırma alanları, yalnız boşken yazılır; öbür alanlar değişmez.
CREATE FUNCTION satin_alma_fatura_eslemesi_kaldirma() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kaldirilma IS NOT NULL
     OR NEW.id IS DISTINCT FROM OLD.id OR NEW.belge_id IS DISTINCT FROM OLD.belge_id
     OR NEW.siparis_satiri_id IS DISTINCT FROM OLD.siparis_satiri_id OR NEW.tutar IS DISTINCT FROM OLD.tutar
     OR NEW.ekleyen_kisi_id IS DISTINCT FROM OLD.ekleyen_kisi_id OR NEW.olusturma IS DISTINCT FROM OLD.olusturma THEN
    RAISE EXCEPTION 'satin_alma_fatura_eslemesi: yalnız kaldırma alanları bir kez yazılır'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'satin_alma_fatura_eslemesi_kaldirma';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER satin_alma_fatura_eslemesi_guncelleme BEFORE UPDATE ON satin_alma_fatura_eslemesi
  FOR EACH ROW EXECUTE FUNCTION satin_alma_fatura_eslemesi_kaldirma();
CREATE TRIGGER satin_alma_fatura_eslemesi_silinmez BEFORE DELETE ON satin_alma_fatura_eslemesi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER satin_alma_fatura_eslemesi_bosaltilmaz BEFORE TRUNCATE ON satin_alma_fatura_eslemesi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
