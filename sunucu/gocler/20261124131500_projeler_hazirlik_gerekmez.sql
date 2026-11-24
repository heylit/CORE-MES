-- 3642: "Bu emirde gerekmez" işareti. Hazırlık maddesi (emir, madde) için gerekçeli, yalnız eklenen defter: işaret ve kaldırma birer satırdır,
-- geçerli hâl (emir, madde) başına son satırdır. Yeni tablo, boş başlar; var olan görev ve madde satırına dokunulmaz. Emir bağı yabancı
-- anahtarsızdır (emir Üretim Emirleri'nindir, hazırlık görevinin emir bağı gibi). Geri alma: tablo boşken kaldırılabilir.
CREATE TABLE projeler_hazirlik_gerekmez (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emri_id int NOT NULL,
  madde text NOT NULL CONSTRAINT projeler_hazirlik_gerekmez_madde_bicim CHECK (madde ~ '^[a-z][a-z-]{0,39}$'),
  olay text NOT NULL CONSTRAINT projeler_hazirlik_gerekmez_olay CHECK (olay IN ('isaretle', 'kaldir')),
  kisi_id int NOT NULL CONSTRAINT projeler_hazirlik_gerekmez_kisi REFERENCES kisi (id),
  gerekce text CONSTRAINT projeler_hazirlik_gerekmez_gerekce_bicim CHECK (btrim(gerekce) = gerekce AND length(gerekce) BETWEEN 1 AND 450),
  an timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projeler_hazirlik_gerekmez_isaret_gerekceli CHECK (olay <> 'isaretle' OR gerekce IS NOT NULL)
);
CREATE INDEX projeler_hazirlik_gerekmez_emir_idx ON projeler_hazirlik_gerekmez (emri_id, madde, id);
CREATE TRIGGER projeler_hazirlik_gerekmez_degismez BEFORE UPDATE OR DELETE ON projeler_hazirlik_gerekmez
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER projeler_hazirlik_gerekmez_bosaltilmaz BEFORE TRUNCATE ON projeler_hazirlik_gerekmez
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
