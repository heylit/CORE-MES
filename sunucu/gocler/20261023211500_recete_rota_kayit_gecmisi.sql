-- Reçete ve Rota kayıtlarının geçmişi (242 a): kayıt değiştiğinde ya da silindiğinde önceki değeri, sürümü ve yazanı buraya düşer;
-- yerine yazan da tutulur. Servisi atlayan yazma da tetikleyiciyle girer. Satır değiştirilmez; anahtar başına son 50 sürüm kalır,
-- daha eskisi aynı işlemde silinir. Göçten önceki değişikliklerin geçmişi yoktur; geçmiş bu göçle başlar.
CREATE TABLE recete_rota_kayit_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anahtar text NOT NULL,
  surum bigint NOT NULL,
  bicim text NOT NULL,
  deger jsonb NOT NULL,
  yazan_kisi_id int NOT NULL,
  yazildi timestamptz NOT NULL,
  degistiren_kisi_id int,
  degisti timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recete_rota_kayit_gecmisi_anahtar ON recete_rota_kayit_gecmisi (anahtar, id);

CREATE TRIGGER recete_rota_kayit_gecmisi_degismez BEFORE UPDATE ON recete_rota_kayit_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER recete_rota_kayit_gecmisi_bosaltilmaz BEFORE TRUNCATE ON recete_rota_kayit_gecmisi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Silmeyi yalnız geçmişi yazan tetikleyici yapar (50 sürüm sınırı); doğrudan silme reddedilir.
CREATE FUNCTION recete_rota_kayit_gecmisi_silinmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION '% tablosuna yalnız ekleme yapılır', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER recete_rota_kayit_gecmisi_silinmez BEFORE DELETE ON recete_rota_kayit_gecmisi
  FOR EACH ROW EXECUTE FUNCTION recete_rota_kayit_gecmisi_silinmez();

-- Aynı değeri yeniden yazmak değişiklik değildir. Silmede silen bilinmez (servis kişi taşımaz).
CREATE FUNCTION recete_rota_kayit_gecmise_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (NEW.bicim, NEW.deger) IS DISTINCT FROM (OLD.bicim, OLD.deger) THEN
    INSERT INTO recete_rota_kayit_gecmisi (anahtar, surum, bicim, deger, yazan_kisi_id, yazildi, degistiren_kisi_id)
    VALUES (OLD.anahtar, OLD.surum, OLD.bicim, OLD.deger, OLD.guncelleyen_kisi_id, OLD.guncellendi,
            CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.guncelleyen_kisi_id END);
    DELETE FROM recete_rota_kayit_gecmisi
     WHERE anahtar = OLD.anahtar
       AND id <= (SELECT id FROM recete_rota_kayit_gecmisi WHERE anahtar = OLD.anahtar ORDER BY id DESC OFFSET 50 LIMIT 1);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER recete_rota_kayit_gecmise_yaz AFTER UPDATE OR DELETE ON recete_rota_kayit
  FOR EACH ROW EXECUTE FUNCTION recete_rota_kayit_gecmise_yaz();
