-- Hatalı parça (1033 a, 1034, 1036 a): terminalde "Hatalı" ile ayrılan parça kola (ya da kök emirde ek adımlara) geçer; kolun ilk adımı
-- kalite kararı, ikincisi kararla planlamanın seçtiği rework adımıdır. Yeni ve boş tablo; dolu tabloya dokunulmaz.
-- Kayıt silinmez; kararı bir kez yazılır (karar sütunları dışında satır değişmez).
CREATE TABLE uretim_emirleri_hatali_kaydi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Hatanın görüldüğü emir ve adım.
  uretim_emri_id int NOT NULL REFERENCES uretim_emri,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri,
  -- Kalite ve rework adımlarını taşıyan emir: açılan kol ya da (bölünemeyen emirde, 4 a) emrin kendisi.
  hedef_emir_id int NOT NULL REFERENCES uretim_emri,
  kalite_is_emri_id int NOT NULL CONSTRAINT uretim_emirleri_hatali_kaydi_kalite_tek UNIQUE REFERENCES uretim_emirleri_is_emri,
  -- Kararla planlamanın dolduracağı adım. Hurda ve red kararında adım silinir, bağ boşalır.
  rework_is_emri_id int CONSTRAINT uretim_emirleri_hatali_kaydi_rework_tek UNIQUE REFERENCES uretim_emirleri_is_emri,
  -- Emrin kendisine adım girdiğinde (4 a) hatalı adımın tekrarı; kolda tekrar kolun kopyalanan adımıdır, burada boştur.
  tekrar_is_emri_id int CONSTRAINT uretim_emirleri_hatali_kaydi_tekrar_tek UNIQUE REFERENCES uretim_emirleri_is_emri,
  hurda_nedeni_id int NOT NULL REFERENCES hurda_nedeni,
  adet int NOT NULL CONSTRAINT uretim_emirleri_hatali_kaydi_adet_pozitif CHECK (adet > 0),
  aciklama text CONSTRAINT uretim_emirleri_hatali_kaydi_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 300)),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  karar text CONSTRAINT uretim_emirleri_hatali_kaydi_karar_degeri CHECK (karar IN ('rework', 'hurda', 'red')),
  karar_kisi_id int REFERENCES kisi,
  karar_zamani timestamptz,
  karar_notu text CONSTRAINT uretim_emirleri_hatali_kaydi_karar_notu_bicimi CHECK (karar_notu IS NULL OR (btrim(karar_notu) <> '' AND char_length(karar_notu) <= 500)),
  -- Kalite Merkezi'nin uygunsuzluk kaydı (1038 a); belge kalite modülünündir, burada yalnız kimliği durur.
  ncr_kimlik text CONSTRAINT uretim_emirleri_hatali_kaydi_ncr_bicimi CHECK (ncr_kimlik IS NULL OR ncr_kimlik ~ '^[A-Za-z0-9_.:@+~|-]{1,200}$'),
  CONSTRAINT uretim_emirleri_hatali_kaydi_karar_alanlari CHECK (
    (karar IS NULL) = (karar_kisi_id IS NULL) AND (karar IS NULL) = (karar_zamani IS NULL) AND (karar IS NOT NULL OR (karar_notu IS NULL AND ncr_kimlik IS NULL))
  ),
  CONSTRAINT uretim_emirleri_hatali_kaydi_rework_adimli CHECK (karar IN ('hurda', 'red') OR rework_is_emri_id IS NOT NULL),
  CONSTRAINT uretim_emirleri_hatali_kaydi_kararla_bosalir CHECK (karar IS NULL OR karar = 'rework' OR (rework_is_emri_id IS NULL AND tekrar_is_emri_id IS NULL)),
  CONSTRAINT uretim_emirleri_hatali_kaydi_tekrar_emirde CHECK (tekrar_is_emri_id IS NULL OR hedef_emir_id = uretim_emri_id)
);
CREATE INDEX uretim_emirleri_hatali_kaydi_emir_idx ON uretim_emirleri_hatali_kaydi (uretim_emri_id);
CREATE INDEX uretim_emirleri_hatali_kaydi_hedef_idx ON uretim_emirleri_hatali_kaydi (hedef_emir_id);
CREATE INDEX uretim_emirleri_hatali_kaydi_is_emri_idx ON uretim_emirleri_hatali_kaydi (is_emri_id);
CREATE INDEX uretim_emirleri_hatali_kaydi_neden_idx ON uretim_emirleri_hatali_kaydi (hurda_nedeni_id);
CREATE INDEX uretim_emirleri_hatali_kaydi_kisi_idx ON uretim_emirleri_hatali_kaydi (kisi_id);
CREATE INDEX uretim_emirleri_hatali_kaydi_karar_kisi_idx ON uretim_emirleri_hatali_kaydi (karar_kisi_id);
CREATE INDEX uretim_emirleri_hatali_kaydi_acik_idx ON uretim_emirleri_hatali_kaydi (zaman) WHERE karar IS NULL;

-- Kararsız satıra yalnız karar sütunları bir kez yazılır (hurda ve redde rework ve tekrar bağları boşalır); kararlı satır ve öteki
-- sütunlar değişmez, satır silinmez.
CREATE FUNCTION uretim_emirleri_hatali_kaydi_karar_bir_kez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'uretim_emirleri_hatali_kaydi satırı silinmez' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.karar IS NOT NULL OR NEW.karar IS NULL
     OR (OLD.id, OLD.uretim_emri_id, OLD.is_emri_id, OLD.hedef_emir_id, OLD.kalite_is_emri_id, OLD.hurda_nedeni_id,
         OLD.adet, OLD.aciklama, OLD.kisi_id, OLD.zaman)
        IS DISTINCT FROM
        (NEW.id, NEW.uretim_emri_id, NEW.is_emri_id, NEW.hedef_emir_id, NEW.kalite_is_emri_id, NEW.hurda_nedeni_id,
         NEW.adet, NEW.aciklama, NEW.kisi_id, NEW.zaman)
     OR ((NEW.rework_is_emri_id, NEW.tekrar_is_emri_id) IS DISTINCT FROM (OLD.rework_is_emri_id, OLD.tekrar_is_emri_id) AND NEW.karar = 'rework') THEN
    RAISE EXCEPTION 'uretim_emirleri_hatali_kaydi: yalnız kararsız satıra bir kez karar yazılır' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER uretim_emirleri_hatali_kaydi_karar_bir_kez BEFORE UPDATE OR DELETE ON uretim_emirleri_hatali_kaydi
  FOR EACH ROW EXECUTE FUNCTION uretim_emirleri_hatali_kaydi_karar_bir_kez();
CREATE TRIGGER uretim_emirleri_hatali_kaydi_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_hatali_kaydi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
