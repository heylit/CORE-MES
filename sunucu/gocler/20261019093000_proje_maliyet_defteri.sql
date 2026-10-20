-- 199 a: bitmiş iş emrinin maliyeti dondurulur; birim ücret sonradan değişse de eski projenin gerçekleşeni değişmez.
CREATE TABLE proje_maliyet_defteri (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proje_id int NOT NULL CONSTRAINT proje_maliyet_defteri_proje REFERENCES projeler_proje (id),
  is_emri_id int NOT NULL CONSTRAINT proje_maliyet_defteri_is_emri REFERENCES uretim_emirleri_is_emri (id),
  -- Kalem -> TRY tutar (KDV hariç); anahtarı olmayan kalem o iş emrinde yoktur, null bilinmiyor demektir.
  plan jsonb NOT NULL CONSTRAINT proje_maliyet_defteri_plan_nesne CHECK (jsonb_typeof(plan) = 'object'),
  gercek jsonb NOT NULL CONSTRAINT proje_maliyet_defteri_gercek_nesne CHECK (jsonb_typeof(gercek) = 'object'),
  -- Hesapta kullanılan saat ücretleri ve fason tutarları: ücret sonradan değişse de satır kendi hesabını taşır.
  ucretler jsonb NOT NULL CONSTRAINT proje_maliyet_defteri_ucretler_nesne CHECK (jsonb_typeof(ucretler) = 'object'),
  adet int NOT NULL CONSTRAINT proje_maliyet_defteri_adet_pozitif CHECK (adet > 0),
  saglam int CONSTRAINT proje_maliyet_defteri_saglam_negatif_degil CHECK (saglam >= 0),
  bitis timestamptz NOT NULL,
  dondurma timestamptz NOT NULL DEFAULT now(),
  donduran_id int NOT NULL CONSTRAINT proje_maliyet_defteri_donduran REFERENCES kisi (id),
  CONSTRAINT proje_maliyet_defteri_is_emri_tekil UNIQUE (is_emri_id)
);
CREATE INDEX proje_maliyet_defteri_proje_idx ON proje_maliyet_defteri (proje_id);

CREATE TRIGGER proje_maliyet_defteri_degismez BEFORE UPDATE OR DELETE ON proje_maliyet_defteri
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER proje_maliyet_defteri_bosaltilmaz BEFORE TRUNCATE ON proje_maliyet_defteri
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
