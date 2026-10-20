-- Deneme kaydı bekleme hesabının kanıtıdır: değiştirilemez, boşaltılamaz; yalnız saklama süresini (30 gün) doldurmuş satır silinir.
CREATE FUNCTION giris_denemesi_eski_silinir() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Veritabanı saati: uygulamanın gönderdiği saate güvenilmez.
  IF OLD.zaman < now() - interval '30 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% tablosundan yalnız 30 günden eski satır silinir', TG_TABLE_NAME;
END $$;

CREATE TRIGGER giris_denemesi_degismez BEFORE UPDATE ON giris_denemesi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER giris_denemesi_genc_silinmez BEFORE DELETE ON giris_denemesi
  FOR EACH ROW EXECUTE FUNCTION giris_denemesi_eski_silinir();
-- Satır tetikleyicisi TRUNCATE'te çalışmaz.
CREATE TRIGGER giris_denemesi_bosaltilmaz BEFORE TRUNCATE ON giris_denemesi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
