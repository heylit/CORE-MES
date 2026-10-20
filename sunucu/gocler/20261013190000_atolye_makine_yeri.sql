-- Haritadaki 3B nesne makinedir (kart #1120): her makinenin kendi yeri ve modeli olur; makine kaydı istasyonlar modülündedir.
-- İstasyon yeri silinmez ve değişmez; makinesi yerleşik istasyon haritada çerçeve olarak kalır.

-- Doldurmadan önce sayım: kaç istasyon yeri ve o istasyonlarda kaç aktif makine var (göç günlüğüne düşer).
DO $$
DECLARE
  yer_sayisi int;
  makine_sayisi int;
BEGIN
  SELECT count(*) INTO yer_sayisi FROM atolye_istasyon_yeri;
  SELECT count(*) INTO makine_sayisi FROM atolye_istasyon_yeri y JOIN makine m ON m.istasyon_id = y.istasyon_id AND m.aktif;
  RAISE NOTICE 'atolye_makine_yeri: % istasyon yeri, % aktif makine yerleştirilecek', yer_sayisi, makine_sayisi;
END $$;

-- Bir makinenin en çok bir yeri vardır. Ölçü ve dönüş kuralları istasyon yeriyle aynıdır.
CREATE TABLE atolye_makine_yeri (
  makine_id int PRIMARY KEY REFERENCES makine,
  salon_id int NOT NULL REFERENCES atolye_salon,
  x numeric(6, 2) NOT NULL,
  z numeric(6, 2) NOT NULL,
  donus numeric(4, 1) NOT NULL,
  genislik numeric(5, 2) NOT NULL,
  derinlik numeric(5, 2) NOT NULL,
  model_id int REFERENCES atolye_model,
  CONSTRAINT atolye_makine_yeri_donus CHECK (donus >= 0 AND donus < 360),
  CONSTRAINT atolye_makine_yeri_ayak_izi CHECK (genislik BETWEEN 0.2 AND 50 AND derinlik BETWEEN 0.2 AND 50)
);
CREATE INDEX atolye_makine_yeri_salon_idx ON atolye_makine_yeri (salon_id);
CREATE INDEX atolye_makine_yeri_model_idx ON atolye_makine_yeri (model_id);

-- Makineye yalnız tamamlanmış model atanır.
CREATE FUNCTION atolye_makine_modeli() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.model_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM atolye_model WHERE id = NEW.model_id AND tamam) THEN
    RAISE EXCEPTION 'Modelin yüklemesi tamamlanmamış' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_makine_modeli';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atolye_makine_modeli BEFORE INSERT OR UPDATE OF model_id ON atolye_makine_yeri
  FOR EACH ROW EXECUTE FUNCTION atolye_makine_modeli();

-- Salon içinde kalma denetimi makine yerini de kapsar (salon küçülünce ve makine yeri yazılınca).
CREATE OR REPLACE FUNCTION atolye_salon_icinde() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  disarida text;
BEGIN
  IF TG_TABLE_NAME = 'atolye_salon' THEN
    SELECT string_agg(o, ', ') INTO disarida FROM (
      SELECT 'istasyon ' || istasyon_id AS o FROM atolye_istasyon_yeri y
       WHERE y.salon_id = NEW.id AND NOT atolye_salonda(NEW.id, y.x, y.z, y.donus, y.genislik, y.derinlik)
      UNION ALL
      SELECT 'makine ' || makine_id FROM atolye_makine_yeri y
       WHERE y.salon_id = NEW.id AND NOT atolye_salonda(NEW.id, y.x, y.z, y.donus, y.genislik, y.derinlik)
      UNION ALL
      SELECT 'raf ' || r.kod FROM atolye_raf r
       WHERE r.salon_id = NEW.id AND NOT atolye_salonda(NEW.id, r.x, r.z, r.donus, r.bolme_sayisi * r.bolme_genisligi, r.derinlik)
      UNION ALL
      SELECT 'alan ' || a.ad FROM atolye_alan a
       WHERE a.salon_id = NEW.id AND NOT atolye_salonda(NEW.id, a.x, a.z, a.donus, a.genislik, a.derinlik)
      UNION ALL
      SELECT 'duvar ' || d.id FROM atolye_duvar d
       WHERE d.salon_id = NEW.id AND NOT (least(d.bas_x, d.son_x) >= -0.01 AND greatest(d.bas_x, d.son_x) <= NEW.genislik + 0.01
         AND least(d.bas_z, d.son_z) >= -0.01 AND greatest(d.bas_z, d.son_z) <= NEW.derinlik + 0.01)
    ) t;
  ELSIF TG_TABLE_NAME = 'atolye_istasyon_yeri' THEN
    IF NOT atolye_salonda(NEW.salon_id, NEW.x, NEW.z, NEW.donus, NEW.genislik, NEW.derinlik) THEN
      disarida := 'istasyon ' || NEW.istasyon_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'atolye_makine_yeri' THEN
    IF NOT atolye_salonda(NEW.salon_id, NEW.x, NEW.z, NEW.donus, NEW.genislik, NEW.derinlik) THEN
      disarida := 'makine ' || NEW.makine_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'atolye_raf' THEN
    IF NOT atolye_salonda(NEW.salon_id, NEW.x, NEW.z, NEW.donus, NEW.bolme_sayisi * NEW.bolme_genisligi, NEW.derinlik) THEN
      disarida := 'raf ' || NEW.kod;
    END IF;
  ELSIF TG_TABLE_NAME = 'atolye_alan' THEN
    IF NOT atolye_salonda(NEW.salon_id, NEW.x, NEW.z, NEW.donus, NEW.genislik, NEW.derinlik) THEN
      disarida := 'alan ' || NEW.ad;
    END IF;
  ELSIF TG_TABLE_NAME = 'atolye_duvar' THEN
    IF NOT EXISTS (SELECT 1 FROM atolye_salon s WHERE s.id = NEW.salon_id
         AND least(NEW.bas_x, NEW.son_x) >= -0.01 AND greatest(NEW.bas_x, NEW.son_x) <= s.genislik + 0.01
         AND least(NEW.bas_z, NEW.son_z) >= -0.01 AND greatest(NEW.bas_z, NEW.son_z) <= s.derinlik + 0.01) THEN
      disarida := 'duvar';
    END IF;
  END IF;
  IF disarida IS NOT NULL THEN
    RAISE EXCEPTION 'Öğe salonun dışına taşıyor: %', disarida
      USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_salon_icinde';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER atolye_makine_yeri_salon_icinde AFTER INSERT OR UPDATE ON atolye_makine_yeri
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atolye_salon_icinde();

-- Doldurma: yerleşik istasyonun aktif makineleri istasyonun ayak izine, istasyonun eni boyunca yan yana dizilir
-- (kod sırasıyla). Tek makineli istasyonun modeli makineye geçer; çok makinelide model elle atanır.
INSERT INTO atolye_makine_yeri (makine_id, salon_id, x, z, donus, genislik, derinlik, model_id)
SELECT m.makine_id, y.salon_id,
       round(y.x + ((m.sira - 0.5) * y.genislik / m.adet - y.genislik / 2) * cos(radians(y.donus))::numeric, 2),
       round(y.z + ((m.sira - 0.5) * y.genislik / m.adet - y.genislik / 2) * sin(radians(y.donus))::numeric, 2),
       y.donus,
       greatest(0.2, round(y.genislik / m.adet, 2)),
       y.derinlik,
       CASE WHEN m.adet = 1 THEN y.model_id END
  FROM atolye_istasyon_yeri y
  JOIN (SELECT id AS makine_id, istasyon_id,
               row_number() OVER (PARTITION BY istasyon_id ORDER BY kod) AS sira,
               count(*) OVER (PARTITION BY istasyon_id) AS adet
          FROM makine WHERE aktif AND istasyon_id IS NOT NULL) m ON m.istasyon_id = y.istasyon_id;
