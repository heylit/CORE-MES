-- Üretim anomalisi gün kaydı (kart #1306): canlı plan yeniden yayınlanınca geçmiş günün beklenen adedi kaybolur; gün, hafta ve ay
-- istatistiği günün kendi hesabından okunur. Açık gün gün içinde yenilenir, kapanan gün kesinleşir ve bir daha değişmez.
-- Yalnız iki yeni tablo açılır; var olan tablo değişmez.
CREATE TABLE arkon_anomali_gunu (
  tarih date PRIMARY KEY,
  durum text NOT NULL CONSTRAINT arkon_anomali_gunu_durum_degeri CHECK (durum IN ('acik', 'kesin')),
  -- Son hesabın anı; kapanan günde kapanış hesabıdır.
  hesaplama timestamptz NOT NULL,
  kapanis timestamptz,
  -- Hesapta geçerli eşikler; boş eşik o kuralın kapalı olduğunu söyler.
  giris_yok_dk numeric,
  adet_tolerans_yuzde numeric,
  CONSTRAINT arkon_anomali_gunu_kapanis_tutarli CHECK ((durum = 'kesin') = (kapanis IS NOT NULL))
);

CREATE TABLE arkon_anomali_satiri (
  tarih date NOT NULL CONSTRAINT arkon_anomali_satiri_gun_var REFERENCES arkon_anomali_gunu (tarih),
  kirilim text NOT NULL CONSTRAINT arkon_anomali_satiri_kirilim_degeri CHECK (kirilim IN ('istasyon', 'makine', 'kisi', 'is_emri')),
  -- Kırılımın kimliği (istasyon, makine, kişi ya da iş emri). Geçmiş kayıt silinen tanımı da taşır: yabancı anahtar yoktur.
  kimlik int NOT NULL,
  -- Satırın istasyonu: veri kapsamı bununla süzülür; kişi satırında çözülemezse boş.
  istasyon_id int,
  -- Yalnız iş emri satırında: planlandığı kaynak.
  kaynak_tur text CONSTRAINT arkon_anomali_satiri_kaynak_degeri CHECK (kaynak_tur IN ('makine', 'kisi')),
  kaynak_id int,
  -- Bilinmeyen değer boştur; sıfır uydurulmaz.
  beklenen numeric CONSTRAINT arkon_anomali_satiri_beklenen_eksi_degil CHECK (beklenen >= 0),
  uretilen int,
  hurda int,
  -- Performans: üretilen sağlamın standart süresi ve çalışılan süre (saniye).
  standart_sn int CONSTRAINT arkon_anomali_satiri_standart_eksi_degil CHECK (standart_sn >= 0),
  calisilan_sn int CONSTRAINT arkon_anomali_satiri_calisilan_eksi_degil CHECK (calisilan_sn >= 0),
  -- Eksik adet ya da giriş yok işareti; hüküm yoksa boş.
  isaret boolean,
  CONSTRAINT arkon_anomali_satiri_tekil PRIMARY KEY (tarih, kirilim, kimlik),
  CONSTRAINT arkon_anomali_satiri_kaynak_tutarli CHECK ((kirilim = 'is_emri') = (kaynak_tur IS NOT NULL AND kaynak_id IS NOT NULL))
);

-- Kesinleşmiş gün (kendisi ve satırları) değişmez ve silinmez; açık güne satır yazılır.
CREATE FUNCTION arkon_anomali_kesin_korumasi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'arkon_anomali_gunu' THEN
    IF OLD.durum = 'kesin' THEN
      RAISE EXCEPTION 'Kesinleşmiş anomali günü değişmez: %', OLD.tarih USING ERRCODE = 'check_violation', CONSTRAINT = 'arkon_anomali_gunu_kesin_degismez';
    END IF;
  ELSIF (TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM arkon_anomali_gunu g WHERE g.tarih = OLD.tarih AND g.durum = 'kesin'))
     OR (TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM arkon_anomali_gunu g WHERE g.tarih = NEW.tarih AND g.durum = 'kesin')) THEN
    RAISE EXCEPTION 'Kesinleşmiş anomali gününün satırı değişmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'arkon_anomali_satiri_kesin_degismez';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER arkon_anomali_gunu_kesin BEFORE UPDATE OR DELETE ON arkon_anomali_gunu
  FOR EACH ROW EXECUTE FUNCTION arkon_anomali_kesin_korumasi();
CREATE TRIGGER arkon_anomali_satiri_kesin BEFORE INSERT OR UPDATE OR DELETE ON arkon_anomali_satiri
  FOR EACH ROW EXECUTE FUNCTION arkon_anomali_kesin_korumasi();
