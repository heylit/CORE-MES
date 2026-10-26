-- Planlama çalışmasının sahibi plan modülüdür (kullanıcı kararı 658 b, 661 a, 662 a): Reçete ve Rota kaydındaki `:planlama` anahtarlı
-- satırlar ve geçmişleri buraya aynen taşınır (anahtar, biçim, değer, sürüm, yazan, zaman). Anahtar adı değişmez: açık sayfaların
-- beklenen sürümü ve anahtarı geçerli kalır. Eski satırları Reçete ve Rota'nın göçü siler (aynı sayılar denetlenir).
CREATE SEQUENCE plan_planlama_surum AS bigint;

CREATE TABLE plan_planlama_kaydi (
  anahtar text PRIMARY KEY,
  bicim text NOT NULL,
  deger jsonb NOT NULL,
  surum bigint NOT NULL,
  guncelleyen_kisi_id int NOT NULL,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_planlama_kaydi_anahtar_bicimi CHECK (anahtar ~ '^recete-rota-motoru-v1:planlama([-:][A-Za-z0-9_.:-]{1,80})?$'),
  CONSTRAINT plan_planlama_kaydi_bicim CHECK (bicim IN ('json', 'metin')),
  CONSTRAINT plan_planlama_kaydi_metin_dize CHECK (bicim <> 'metin' OR jsonb_typeof(deger) = 'string')
);

CREATE TABLE plan_planlama_kaydi_gecmisi (
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
CREATE INDEX plan_planlama_kaydi_gecmisi_anahtar ON plan_planlama_kaydi_gecmisi (anahtar, id);

-- Taşıma: geçmiş önce, sıra korunur (id sırası değişme sırasıdır). Taşınan satırın değiştireni ve zamanı aynen kalır.
INSERT INTO plan_planlama_kaydi_gecmisi (anahtar, surum, bicim, deger, yazan_kisi_id, yazildi, degistiren_kisi_id, degisti)
SELECT anahtar, surum, bicim, deger, yazan_kisi_id, yazildi, degistiren_kisi_id, degisti
  FROM recete_rota_kayit_gecmisi
 WHERE anahtar ~ '^recete-rota-motoru-v1:planlama([-:]|$)'
 ORDER BY id;

INSERT INTO plan_planlama_kaydi (anahtar, bicim, deger, surum, guncelleyen_kisi_id, guncellendi)
SELECT anahtar, bicim, deger, surum, guncelleyen_kisi_id, guncellendi
  FROM recete_rota_kayit
 WHERE anahtar ~ '^recete-rota-motoru-v1:planlama([-:]|$)';

-- Sürüm taşınan en büyük sürümden devam eder: açık sayfanın beklediği sürüm yeni yazmayla çakışmaz.
SELECT setval('plan_planlama_surum', greatest((SELECT max(surum) FROM plan_planlama_kaydi), 1), (SELECT count(*) FROM plan_planlama_kaydi) > 0);

DO $$
DECLARE kaynak bigint; hedef bigint; kaynak_gecmis bigint; hedef_gecmis bigint;
BEGIN
  SELECT count(*) INTO kaynak FROM recete_rota_kayit WHERE anahtar ~ '^recete-rota-motoru-v1:planlama([-:]|$)';
  SELECT count(*) INTO hedef FROM plan_planlama_kaydi;
  SELECT count(*) INTO kaynak_gecmis FROM recete_rota_kayit_gecmisi WHERE anahtar ~ '^recete-rota-motoru-v1:planlama([-:]|$)';
  SELECT count(*) INTO hedef_gecmis FROM plan_planlama_kaydi_gecmisi;
  IF kaynak <> hedef OR kaynak_gecmis <> hedef_gecmis THEN
    RAISE EXCEPTION 'planlama kaydı taşınamadı: kayıt % / %, geçmiş % / %', kaynak, hedef, kaynak_gecmis, hedef_gecmis;
  END IF;
  RAISE NOTICE 'planlama kaydı taşındı: % kayıt, % geçmiş satırı', hedef, hedef_gecmis;
END $$;

-- Kaydı yazan kişi kisi tablosundadır. Taşınan eski satırlar denetlenmez (NOT VALID; kaynak tabloda da öyleydi), yeni yazma denetlenir.
ALTER TABLE plan_planlama_kaydi
  ADD CONSTRAINT plan_planlama_kaydi_guncelleyen_kisi_fk FOREIGN KEY (guncelleyen_kisi_id) REFERENCES kisi (id) NOT VALID;

-- Geçmiş yalnız eklenir; anahtar başına son 50 sürüm kalır, eskisini yalnız geçmişi yazan tetikleyici siler (Reçete ve Rota'daki gibi, 242 a).
CREATE TRIGGER plan_planlama_kaydi_gecmisi_degismez BEFORE UPDATE ON plan_planlama_kaydi_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_planlama_kaydi_gecmisi_bosaltilmaz BEFORE TRUNCATE ON plan_planlama_kaydi_gecmisi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE FUNCTION plan_planlama_kaydi_gecmisi_silinmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION '% tablosuna yalnız ekleme yapılır', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER plan_planlama_kaydi_gecmisi_silinmez BEFORE DELETE ON plan_planlama_kaydi_gecmisi
  FOR EACH ROW EXECUTE FUNCTION plan_planlama_kaydi_gecmisi_silinmez();

-- Aynı değeri yeniden yazmak değişiklik değildir. Silmede silen bilinmez (servis kişi taşımaz).
CREATE FUNCTION plan_planlama_kaydi_gecmise_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (NEW.bicim, NEW.deger) IS DISTINCT FROM (OLD.bicim, OLD.deger) THEN
    INSERT INTO plan_planlama_kaydi_gecmisi (anahtar, surum, bicim, deger, yazan_kisi_id, yazildi, degistiren_kisi_id)
    VALUES (OLD.anahtar, OLD.surum, OLD.bicim, OLD.deger, OLD.guncelleyen_kisi_id, OLD.guncellendi,
            CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.guncelleyen_kisi_id END);
    DELETE FROM plan_planlama_kaydi_gecmisi
     WHERE anahtar = OLD.anahtar
       AND id <= (SELECT id FROM plan_planlama_kaydi_gecmisi WHERE anahtar = OLD.anahtar ORDER BY id DESC OFFSET 50 LIMIT 1);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER plan_planlama_kaydi_gecmise_yaz AFTER UPDATE OR DELETE ON plan_planlama_kaydi
  FOR EACH ROW EXECUTE FUNCTION plan_planlama_kaydi_gecmise_yaz();
