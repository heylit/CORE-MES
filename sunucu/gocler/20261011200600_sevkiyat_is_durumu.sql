-- Sevkiyat işi havuzdan geçer: plana alınır (planlandı), onayla yola çıkar (yolda), teslim edilir (tamamlandı) ya da yapılamayıp havuza döner.

ALTER TABLE sevkiyat_isi
  -- İşin istendiği gün; tarih ise işin bulunduğu gündür (geciken iş plana alınınca o güne taşınır).
  ADD COLUMN istenen_tarih date,
  ADD COLUMN durum text NOT NULL DEFAULT 'havuzda',
  ADD COLUMN durum_zamani timestamptz NOT NULL DEFAULT now();
-- Yoldaki ya da tamamlanmış işin içeriği değişmez ve iptal edilmez; yalnız durumu ve bulunduğu gün değişir.
-- Yapılamayıp havuza dönen iş onaylı planda durur ama yeniden düzenlenip planlanabilir.
CREATE OR REPLACE FUNCTION sevkiyat_onayli_plandaki_is_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  durum_alanlari text[] := ARRAY['durum', 'durum_zamani', 'tarih'];
BEGIN
  IF OLD.durum IN ('yolda', 'tamamlandi') AND (to_jsonb(NEW) - durum_alanlari) <> (to_jsonb(OLD) - durum_alanlari) THEN
    RAISE EXCEPTION 'Yoldaki ya da tamamlanmış iş değiştirilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_onayli_plandaki_is_degismez';
  END IF;
  RETURN NEW;
END $$;

UPDATE sevkiyat_isi SET istenen_tarih = tarih;
UPDATE sevkiyat_isi i
   SET durum = CASE WHEN p.onaylandi IS NULL THEN 'planlandi' ELSE 'yolda' END
  FROM sevkiyat_plan_duragi d JOIN sevkiyat_plani p ON p.id = d.plan_id
 WHERE d.is_id = i.id;
ALTER TABLE sevkiyat_isi
  ALTER COLUMN istenen_tarih SET NOT NULL,
  ADD CONSTRAINT sevkiyat_isi_durum CHECK (durum IN ('havuzda', 'planlandi', 'yolda', 'tamamlandi'));
CREATE INDEX sevkiyat_isi_havuz ON sevkiyat_isi (tarih) WHERE iptal_edildi IS NULL AND durum IN ('havuzda', 'planlandi');

-- Yapılamayan iş başka günün planına girer: durak işle aynı günde olmak zorunda değildir.
ALTER TABLE sevkiyat_plan_duragi
  DROP CONSTRAINT sevkiyat_plan_duragi_is_tarihi,
  ADD CONSTRAINT sevkiyat_plan_duragi_is FOREIGN KEY (is_id) REFERENCES sevkiyat_isi,
  -- Onaylı planda durağın sonucu: teslim edildi (alındı) ya da yapılamadı.
  ADD COLUMN sonuc text,
  ADD COLUMN sonuc_zamani timestamptz,
  ADD COLUMN sonuc_notu text,
  ADD CONSTRAINT sevkiyat_plan_duragi_sonuc CHECK (sonuc IN ('tamamlandi', 'yapilamadi')),
  ADD CONSTRAINT sevkiyat_plan_duragi_sonuc_butun CHECK (
    (sonuc IS NULL) = (sonuc_zamani IS NULL) AND (sonuc_notu IS NULL OR sonuc IS NOT NULL) AND (sonuc IS NULL OR is_id IS NOT NULL)
  ),
  ADD CONSTRAINT sevkiyat_plan_duragi_sonuc_notu CHECK (btrim(sonuc_notu) <> '');
CREATE INDEX sevkiyat_plan_duragi_is ON sevkiyat_plan_duragi (is_id) WHERE is_id IS NOT NULL;

-- Onaylı plan değişmez; yalnız durağın sonucu yazılabilir ve geri alınabilir.
CREATE OR REPLACE FUNCTION sevkiyat_onayli_plan_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  hedef int := CASE WHEN TG_OP = 'DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
  sonuc_alanlari text[] := ARRAY['sonuc', 'sonuc_zamani', 'sonuc_notu'];
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'sevkiyat_plan_duragi' AND (to_jsonb(NEW) - sonuc_alanlari) = (to_jsonb(OLD) - sonuc_alanlari) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM sevkiyat_plani WHERE id = hedef AND onaylandi IS NOT NULL) THEN
    RAISE EXCEPTION 'Onaylı sevkiyat planı değiştirilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_onayli_plan_degismez';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
