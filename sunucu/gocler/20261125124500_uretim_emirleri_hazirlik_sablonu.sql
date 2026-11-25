-- 3688: hazırlık şablonu operasyon türüne göre (Faz 1): yeni BOŞ tablolar, veri silmez ve dönüştürmez; var olan satıra dokunulmaz.
-- Hazirlik sablonu operasyon turune gore Uretim Emirleri'ndedir. "Kaydet" yeni surum yazar (eski surumler kalir: kim, ne zaman, neden).
-- Etkin sablon = tur icin en yuksek surum; turu olmayan adim icin tur = NULL (varsayilan) surumu.
CREATE TABLE uretim_emirleri_hazirlik_sablonu_surum (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operasyon_tipi_id int CONSTRAINT uretim_emirleri_hazirlik_sablonu_surum_tip REFERENCES istasyonlar_operasyon_tipi (id),
  surum int NOT NULL CONSTRAINT uretim_emirleri_hazirlik_sablonu_surum_pozitif CHECK (surum >= 1),
  kisi_id int NOT NULL CONSTRAINT uretim_emirleri_hazirlik_sablonu_surum_kisi REFERENCES kisi (id),
  gerekce text CONSTRAINT uretim_emirleri_hazirlik_sablonu_surum_gerekce_bicim CHECK (gerekce IS NULL OR (btrim(gerekce) = gerekce AND length(gerekce) BETWEEN 1 AND 450)),
  an timestamptz NOT NULL DEFAULT now()
);
-- NULL tur da tek sayilir (varsayilan): tur basina tek surum numarasi.
CREATE UNIQUE INDEX uretim_emirleri_hazirlik_sablonu_surum_tek ON uretim_emirleri_hazirlik_sablonu_surum (COALESCE(operasyon_tipi_id, 0), surum);
CREATE TABLE uretim_emirleri_hazirlik_sablonu_satir (
  surum_id bigint NOT NULL CONSTRAINT uretim_emirleri_hazirlik_sablonu_satir_surum REFERENCES uretim_emirleri_hazirlik_sablonu_surum (id),
  madde text NOT NULL CONSTRAINT uretim_emirleri_hazirlik_sablonu_satir_madde_bicim CHECK (madde ~ '^[a-z][a-z-]{0,39}$'),
  gerekli boolean NOT NULL,
  rol_id int CONSTRAINT uretim_emirleri_hazirlik_sablonu_satir_rol REFERENCES rol (id),
  gun int NOT NULL DEFAULT 2 CONSTRAINT uretim_emirleri_hazirlik_sablonu_satir_gun CHECK (gun BETWEEN 0 AND 60),
  PRIMARY KEY (surum_id, madde)
);
-- Emre ozel fark: yalniz eklenen defter (isaret ve "Sablona don" birer satir); gecerli hal (emir, madde) basina son satirdir.
CREATE TABLE uretim_emirleri_hazirlik_sablonu_ozel (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emri_id int NOT NULL CONSTRAINT uretim_emirleri_hazirlik_sablonu_ozel_emir REFERENCES uretim_emri (id),
  madde text NOT NULL CONSTRAINT uretim_emirleri_hazirlik_sablonu_ozel_madde_bicim CHECK (madde ~ '^[a-z][a-z-]{0,39}$'),
  olay text NOT NULL CONSTRAINT uretim_emirleri_hazirlik_sablonu_ozel_olay CHECK (olay IN ('yaz', 'sil')),
  gerekli boolean,
  rol_id int CONSTRAINT uretim_emirleri_hazirlik_sablonu_ozel_rol REFERENCES rol (id),
  gun int CONSTRAINT uretim_emirleri_hazirlik_sablonu_ozel_gun CHECK (gun IS NULL OR gun BETWEEN 0 AND 60),
  kisi_id int NOT NULL CONSTRAINT uretim_emirleri_hazirlik_sablonu_ozel_kisi REFERENCES kisi (id),
  gerekce text CONSTRAINT uretim_emirleri_hazirlik_sablonu_ozel_gerekce_bicim CHECK (gerekce IS NULL OR (btrim(gerekce) = gerekce AND length(gerekce) BETWEEN 1 AND 450)),
  an timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uretim_emirleri_hazirlik_sablonu_ozel_yaz_dolu CHECK (olay <> 'yaz' OR gerekli IS NOT NULL OR rol_id IS NOT NULL OR gun IS NOT NULL)
);
CREATE INDEX uretim_emirleri_hazirlik_sablonu_ozel_emir_idx ON uretim_emirleri_hazirlik_sablonu_ozel (emri_id, madde, id);
-- Defterler yalniz eklenir (surum ve satirlar da degismez: "kaydet" yeni surumdur).
CREATE TRIGGER uretim_emirleri_hazirlik_sablonu_surum_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_hazirlik_sablonu_surum FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_hazirlik_sablonu_satir_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_hazirlik_sablonu_satir FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_hazirlik_sablonu_ozel_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_hazirlik_sablonu_ozel FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_hazirlik_sablonu_surum_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_hazirlik_sablonu_surum FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_hazirlik_sablonu_satir_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_hazirlik_sablonu_satir FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_hazirlik_sablonu_ozel_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_hazirlik_sablonu_ozel FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
-- Geri alma: tablolar bos iken kaldirilabilir (veri silen bir adim yok; ilk surum ekranda "Varsayilan sablonu olustur" ile yazilir, tohum yok).
