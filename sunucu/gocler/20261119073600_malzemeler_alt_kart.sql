-- 3438 a: revizyon ve alternatif, ana kartın altında kendi kodu, stoğu ve rotası olan alt karttır; ana kart stoklu kalır ve ilk revizyondur.
-- Yalnız boş olabilen sütun eklenir; var olan kartlar ana kart kalır, veri değişmez.
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN ana_kart_no int CONSTRAINT malzeme_katalog_karti_ana_kart REFERENCES malzeme_katalog_karti (no),
  ADD COLUMN alt_tur text CONSTRAINT malzeme_katalog_karti_alt_tur_degeri CHECK (alt_tur IN ('revizyon', 'alternatif')),
  ADD COLUMN alt_etiket text CONSTRAINT malzeme_katalog_karti_alt_etiket_bicimi CHECK (
    alt_etiket IS NULL OR (btrim(alt_etiket) <> '' AND char_length(alt_etiket) <= 20)
  ),
  -- Revizyonu olan ailede ana kart ve revizyon alt kartları dolu; ana kart taslak olamaz (bugün kullanımdadır), alternatifte boş.
  ADD COLUMN rev_durumu text CONSTRAINT malzeme_katalog_karti_rev_durumu_degeri CHECK (rev_durumu IN ('taslak', 'yururlukte', 'eski')),
  ADD CONSTRAINT malzeme_katalog_karti_alt_butun CHECK (
    (ana_kart_no IS NULL AND alt_tur IS NULL AND alt_etiket IS NULL)
    OR (ana_kart_no IS NOT NULL AND alt_tur IS NOT NULL AND alt_etiket IS NOT NULL)
  ),
  ADD CONSTRAINT malzeme_katalog_karti_rev_durumu_turu CHECK (
    (alt_tur = 'revizyon' AND rev_durumu IS NOT NULL)
    OR (alt_tur = 'alternatif' AND rev_durumu IS NULL)
    OR (alt_tur IS NULL AND (rev_durumu IS NULL OR rev_durumu IN ('yururlukte', 'eski')))
  ),
  ADD CONSTRAINT malzeme_katalog_karti_kendi_altinda_degil CHECK (ana_kart_no IS DISTINCT FROM no);

CREATE UNIQUE INDEX malzeme_katalog_karti_alt_etiket_tek ON malzeme_katalog_karti (ana_kart_no, alt_etiket) WHERE ana_kart_no IS NOT NULL;
-- Ailede (ana kart ve alt kartları) yürürlükte en çok bir revizyon.
CREATE UNIQUE INDEX malzeme_katalog_karti_tek_yururlukte ON malzeme_katalog_karti ((coalesce(ana_kart_no, no))) WHERE rev_durumu = 'yururlukte';

-- Tek seviye: ana kart başka kartın alt kartı olamaz, alt kartı olan kart alt kart olamaz. Bağ başka ana karta taşınmaz (kaldırılabilir).
CREATE FUNCTION malzeme_katalog_karti_alt_seviye() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.ana_kart_no IS NOT NULL AND NEW.ana_kart_no IS NOT NULL AND NEW.ana_kart_no <> OLD.ana_kart_no THEN
    RAISE EXCEPTION 'Alt kartın ana kartı değişmez (kart %)', NEW.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_ana_degismez';
  END IF;
  IF NEW.ana_kart_no IS NOT NULL THEN
    -- Ana satır kilitlenir: aynı anda başka ailede ana kartı alt karta çeviren yazım beklenir, denetim onun sonucunu görür.
    PERFORM 1 FROM malzeme_katalog_karti WHERE no = NEW.ana_kart_no FOR UPDATE;
    IF EXISTS (SELECT 1 FROM malzeme_katalog_karti a WHERE a.no = NEW.ana_kart_no AND a.ana_kart_no IS NOT NULL)
       OR EXISTS (SELECT 1 FROM malzeme_katalog_karti c WHERE c.ana_kart_no = NEW.no) THEN
      RAISE EXCEPTION 'Alt kartın alt kartı olmaz (kart %)', NEW.kimlik
        USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_tek_seviye';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER malzeme_katalog_karti_alt_seviye BEFORE INSERT OR UPDATE OF ana_kart_no ON malzeme_katalog_karti
  FOR EACH ROW EXECUTE FUNCTION malzeme_katalog_karti_alt_seviye();
CREATE INDEX malzeme_katalog_karti_ana_kart_idx ON malzeme_katalog_karti (ana_kart_no) WHERE ana_kart_no IS NOT NULL;
