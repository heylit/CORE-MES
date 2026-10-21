-- Canlı ve önceki planlar hiçbir zaman silinmez (kullanıcı kararı, 2026-10-21): canlı satır silinmeden ya da değişmeden önceki hâli geçmişe
-- yazılır, kapanmış senaryo değişmez, canlı plan ayarının önceki hâli kalır.

-- Canlı yerleşimin ve parçasının kalkan ya da değişen hâli. Canlıya alma (satır silinip yeniden yazılır) ve iş emri silinince zincirleme
-- silme (279 a) aynı yoldan geçer; satır, kalktığı andaki canlı plan sürümüyle tutulur.
CREATE TABLE plan_canli_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tablo text NOT NULL CONSTRAINT plan_canli_gecmisi_tablo CHECK (tablo IN ('yerlesim', 'parca')),
  islem text NOT NULL CONSTRAINT plan_canli_gecmisi_islem CHECK (islem IN ('silme', 'degisme')),
  is_emri_id int NOT NULL,
  plan_surumu int NOT NULL,
  satir jsonb NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_canli_gecmisi_is_emri_idx ON plan_canli_gecmisi (is_emri_id, id);

CREATE TRIGGER plan_canli_gecmisi_degismez BEFORE UPDATE OR DELETE ON plan_canli_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_canli_gecmisi_bosaltilmaz BEFORE TRUNCATE ON plan_canli_gecmisi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE FUNCTION plan_canli_gecmise_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NULL;
  END IF;
  INSERT INTO plan_canli_gecmisi (tablo, islem, is_emri_id, plan_surumu, satir)
  VALUES (TG_ARGV[0], CASE TG_OP WHEN 'DELETE' THEN 'silme' ELSE 'degisme' END, OLD.is_emri_id,
          (SELECT surum FROM plan_durumu), to_jsonb(OLD));
  RETURN NULL;
END $$;

CREATE TRIGGER plan_yerlesimi_gecmis AFTER UPDATE OR DELETE ON plan_yerlesimi
  FOR EACH ROW EXECUTE FUNCTION plan_canli_gecmise_yaz('yerlesim');
CREATE TRIGGER plan_yerlesim_parcasi_gecmis AFTER UPDATE OR DELETE ON plan_yerlesim_parcasi
  FOR EACH ROW EXECUTE FUNCTION plan_canli_gecmise_yaz('parca');
-- Boşaltma satır tetikleyicisinden geçmez; canlı plan boşaltılmaz.
CREATE TRIGGER plan_yerlesimi_bosaltilmaz BEFORE TRUNCATE ON plan_yerlesimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_yerlesim_parcasi_bosaltilmaz BEFORE TRUNCATE ON plan_yerlesim_parcasi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Canlı plan ayarının (kural, kısıtlar, bedel ve çarpanlar) değişmeden önceki hâli.
CREATE TABLE plan_ayari_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  satir jsonb NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER plan_ayari_gecmisi_degismez BEFORE UPDATE OR DELETE ON plan_ayari_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_ayari_gecmisi_bosaltilmaz BEFORE TRUNCATE ON plan_ayari_gecmisi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE FUNCTION plan_ayari_gecmise_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(OLD) <> to_jsonb(NEW) THEN
    INSERT INTO plan_ayari_gecmisi (satir) VALUES (to_jsonb(OLD));
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER plan_ayari_gecmis AFTER UPDATE ON plan_ayari
  FOR EACH ROW EXECUTE FUNCTION plan_ayari_gecmise_yaz();
CREATE TRIGGER plan_ayari_silinmez BEFORE DELETE ON plan_ayari
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_ayari_bosaltilmaz BEFORE TRUNCATE ON plan_ayari
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Kapanmış senaryo (canlıya alındı ya da vazgeçildi) önceki planın kaydıdır: kendisi silinmez, yerleşimleri, parçaları, ayarı ve defteri
-- değişmez. Serbest kalan iki yazma bugünkü kodun yoludur: senaryonun adı, açıklaması ve sürümü (stüdyo kartı) ile acil sipariş
-- denemesinin verisi (286 b: sipariş onaylanınca emir kimliği, senaryo kapandıktan sonra yazılır). Açık senaryo (taslak) serbesttir.
CREATE FUNCTION plan_senaryo_kapali_mi(senaryo int) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT durum <> 'acik' FROM plan_senaryosu WHERE id = senaryo), false)
$$;

CREATE FUNCTION plan_senaryosu_korunur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.durum <> 'acik' AND (TG_OP = 'DELETE'
      OR to_jsonb(NEW) - 'ad' - 'aciklama' - 'surum' <> to_jsonb(OLD) - 'ad' - 'aciklama' - 'surum') THEN
    RAISE EXCEPTION 'Kapanmış senaryo değişmez (plan_senaryosu %)', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER plan_senaryosu_korunur BEFORE UPDATE OR DELETE ON plan_senaryosu
  FOR EACH ROW EXECUTE FUNCTION plan_senaryosu_korunur();

-- Senaryonun alt tabloları: kapanmış senaryoya ekleme, değiştirme ve silme reddedilir; defterde yalnız `veri` değişebilir.
CREATE FUNCTION plan_senaryo_satiri_korunur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND plan_senaryo_kapali_mi(OLD.senaryo_id) THEN
    IF NOT (TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'plan_senaryo_degisikligi' AND to_jsonb(NEW) - 'veri' = to_jsonb(OLD) - 'veri') THEN
      RAISE EXCEPTION 'Kapanmış senaryo değişmez (% %)', TG_TABLE_NAME, OLD.senaryo_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND plan_senaryo_kapali_mi(NEW.senaryo_id) AND NOT (TG_OP = 'UPDATE' AND OLD.senaryo_id = NEW.senaryo_id) THEN
    RAISE EXCEPTION 'Kapanmış senaryo değişmez (% %)', TG_TABLE_NAME, NEW.senaryo_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER plan_senaryo_yerlesimi_korunur BEFORE INSERT OR UPDATE OR DELETE ON plan_senaryo_yerlesimi
  FOR EACH ROW EXECUTE FUNCTION plan_senaryo_satiri_korunur();
CREATE TRIGGER plan_senaryo_yerlesim_parcasi_korunur BEFORE INSERT OR UPDATE OR DELETE ON plan_senaryo_yerlesim_parcasi
  FOR EACH ROW EXECUTE FUNCTION plan_senaryo_satiri_korunur();
CREATE TRIGGER plan_senaryo_ayari_korunur BEFORE INSERT OR UPDATE OR DELETE ON plan_senaryo_ayari
  FOR EACH ROW EXECUTE FUNCTION plan_senaryo_satiri_korunur();
CREATE TRIGGER plan_senaryo_degisikligi_korunur BEFORE INSERT OR UPDATE OR DELETE ON plan_senaryo_degisikligi
  FOR EACH ROW EXECUTE FUNCTION plan_senaryo_satiri_korunur();
CREATE TRIGGER plan_senaryosu_bosaltilmaz BEFORE TRUNCATE ON plan_senaryosu
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_senaryo_yerlesimi_bosaltilmaz BEFORE TRUNCATE ON plan_senaryo_yerlesimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_senaryo_yerlesim_parcasi_bosaltilmaz BEFORE TRUNCATE ON plan_senaryo_yerlesim_parcasi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_senaryo_ayari_bosaltilmaz BEFORE TRUNCATE ON plan_senaryo_ayari
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_senaryo_degisikligi_bosaltilmaz BEFORE TRUNCATE ON plan_senaryo_degisikligi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
