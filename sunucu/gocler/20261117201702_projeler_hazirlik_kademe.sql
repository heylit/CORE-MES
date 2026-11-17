-- 3396 a: hazırlık görevinin kademeli takibi. Ayar tek satırdır. Defter (görev, kademe) tekildir: kesintiden sonra aynı kademe yeniden
-- gitmez; atlanan alt kademe bildirimsiz yazılır, yalnız en yüksek yeni kademe bildirilir (Risk K6). Günlük özet gün başına bir kez.
CREATE TABLE projeler_hazirlik_kademe_ayari (
  id int PRIMARY KEY CONSTRAINT projeler_hazirlik_kademe_ayari_tek CHECK (id = 1),
  hatirlat_gun int NOT NULL DEFAULT 1 CONSTRAINT projeler_hazirlik_kademe_ayari_hatirlat CHECK (hatirlat_gun BETWEEN 0 AND 30),
  yonetici_gun int NOT NULL DEFAULT 1 CONSTRAINT projeler_hazirlik_kademe_ayari_yonetici CHECK (yonetici_gun BETWEEN 0 AND 30),
  devret_gun int NOT NULL DEFAULT 2 CONSTRAINT projeler_hazirlik_kademe_ayari_devret CHECK (devret_gun BETWEEN 0 AND 60),
  yonetici_rol_id int CONSTRAINT projeler_hazirlik_kademe_ayari_rol REFERENCES rol (id),
  surum int NOT NULL DEFAULT 1 CONSTRAINT projeler_hazirlik_kademe_ayari_surum CHECK (surum >= 1),
  degistiren_id int CONSTRAINT projeler_hazirlik_kademe_ayari_degistiren REFERENCES kisi (id),
  degisti timestamptz,
  CONSTRAINT projeler_hazirlik_kademe_ayari_sira CHECK (devret_gun >= yonetici_gun)
);
INSERT INTO projeler_hazirlik_kademe_ayari (id) VALUES (1);

CREATE TABLE projeler_hazirlik_kademe (
  gorev_id int NOT NULL CONSTRAINT projeler_hazirlik_kademe_gorev REFERENCES projeler_gorev (id),
  kademe smallint NOT NULL CONSTRAINT projeler_hazirlik_kademe_no CHECK (kademe BETWEEN 1 AND 5),
  an timestamptz NOT NULL DEFAULT now(),
  bildirildi boolean NOT NULL,
  alici_sayisi int NOT NULL DEFAULT 0 CONSTRAINT projeler_hazirlik_kademe_alici CHECK (alici_sayisi >= 0),
  CONSTRAINT projeler_hazirlik_kademe_tekil PRIMARY KEY (gorev_id, kademe)
);
CREATE TRIGGER projeler_hazirlik_kademe_yalniz_ekleme BEFORE UPDATE OR DELETE ON projeler_hazirlik_kademe
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();

CREATE TABLE projeler_hazirlik_ozet (
  gun date PRIMARY KEY,
  an timestamptz NOT NULL DEFAULT now(),
  gorev_sayisi int NOT NULL CONSTRAINT projeler_hazirlik_ozet_sayi CHECK (gorev_sayisi >= 0)
);
CREATE TRIGGER projeler_hazirlik_kademe_bosaltilmaz BEFORE TRUNCATE ON projeler_hazirlik_kademe
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
