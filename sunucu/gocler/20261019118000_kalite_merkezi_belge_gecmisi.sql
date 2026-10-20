-- Kalite kayıtlarının geçmişi (258 a): kayıt her değiştiğinde ya da silindiğinde önceki gövdesi, sürümü ve yazanı buraya düşer;
-- yerine yazan da tutulur. Servisi atlayan yazma da tetikleyiciyle girer. Satırlar yalnız eklenir. Göçten önceki değişikliklerin
-- geçmişi yoktur; geçmiş bu göçle başlar.
CREATE TABLE kalite_merkezi_belge_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  koleksiyon text NOT NULL,
  kimlik text NOT NULL,
  surum bigint NOT NULL,
  govde jsonb NOT NULL,
  yazan_id int NOT NULL REFERENCES kisi,
  yazildi timestamptz NOT NULL,
  degistiren_id int REFERENCES kisi,
  degisti timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kalite_merkezi_belge_gecmisi_kayit ON kalite_merkezi_belge_gecmisi (koleksiyon, kimlik, surum);

CREATE TRIGGER kalite_merkezi_belge_gecmisi_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_belge_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalite_merkezi_belge_gecmisi_bosaltilmaz BEFORE TRUNCATE ON kalite_merkezi_belge_gecmisi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Aynı gövdeyi yeniden yazmak değişiklik değildir. Satır gerçekten silinirse (servis silmeyi gövdeyi boşaltarak yapar) silen bilinmez.
CREATE FUNCTION kalite_merkezi_belge_gecmise_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.govde IS NOT NULL AND (TG_OP = 'DELETE' OR NEW.govde IS DISTINCT FROM OLD.govde) THEN
    INSERT INTO kalite_merkezi_belge_gecmisi (koleksiyon, kimlik, surum, govde, yazan_id, yazildi, degistiren_id)
    VALUES (OLD.koleksiyon, OLD.kimlik, OLD.surum, OLD.govde, OLD.degistiren_id, OLD.degisti,
            CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.degistiren_id END);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER kalite_merkezi_belge_gecmise_yaz AFTER UPDATE OR DELETE ON kalite_merkezi_belge
  FOR EACH ROW EXECUTE FUNCTION kalite_merkezi_belge_gecmise_yaz();
