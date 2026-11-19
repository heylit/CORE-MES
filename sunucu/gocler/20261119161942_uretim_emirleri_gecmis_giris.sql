-- 3455-1: geçmişte yapılmış adımın tarih ve adetle girilmesi. Yalnız ekler: sayımın kaynağına 'gecmis' eklenir, giriş ayrı defterdedir.
-- Kaynak kısıtı dolu tabloda NOT VALID ile değişir, sonra ayrı adımda doğrulanır (Risk 3455: uzun yazma kilidi yok).
ALTER TABLE uretim_sayimi DROP CONSTRAINT uretim_sayimi_kaynak_degeri;
ALTER TABLE uretim_sayimi
  ADD CONSTRAINT uretim_sayimi_kaynak_degeri CHECK (kaynak IN ('terminal', 'smartes', 'gecmis')) NOT VALID;
ALTER TABLE uretim_sayimi VALIDATE CONSTRAINT uretim_sayimi_kaynak_degeri;

-- Girilen tarih ve operatör bilinmiyorsa boştur (uydurulmaz); iş emrinin zamanları emir geneli aralıktan dolar.
-- Geri alma ayrı satırdır: alınan satırı gösterir, değerleri onunkidir. Defter değişmez, silinmez.
CREATE TABLE uretim_emirleri_gecmis_giris (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL REFERENCES uretim_emri,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri,
  baslama date,
  bitis date,
  saglam_adet int NOT NULL CONSTRAINT uretim_emirleri_gecmis_giris_saglam CHECK (saglam_adet >= 0),
  hurda_adet int NOT NULL CONSTRAINT uretim_emirleri_gecmis_giris_hurda CHECK (hurda_adet >= 0),
  hurda_nedeni_id int REFERENCES hurda_nedeni,
  operator_id int REFERENCES kisi,
  giren_id int NOT NULL REFERENCES kisi,
  stok_yazildi boolean NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now(),
  geri_alinan_id int CONSTRAINT uretim_emirleri_gecmis_giris_tek_geri UNIQUE REFERENCES uretim_emirleri_gecmis_giris,
  CONSTRAINT uretim_emirleri_gecmis_giris_hurda_nedenli CHECK ((hurda_adet > 0) = (hurda_nedeni_id IS NOT NULL)),
  CONSTRAINT uretim_emirleri_gecmis_giris_tarih_sirasi CHECK (baslama IS NULL OR bitis IS NULL OR baslama <= bitis),
  CONSTRAINT uretim_emirleri_gecmis_giris_kendini_almaz CHECK (geri_alinan_id IS DISTINCT FROM id)
);
CREATE INDEX uretim_emirleri_gecmis_giris_emir_idx ON uretim_emirleri_gecmis_giris (uretim_emri_id, id);
CREATE INDEX uretim_emirleri_gecmis_giris_is_emri_idx ON uretim_emirleri_gecmis_giris (is_emri_id);

CREATE TRIGGER uretim_emirleri_gecmis_giris_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_gecmis_giris
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_gecmis_giris_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_gecmis_giris
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
