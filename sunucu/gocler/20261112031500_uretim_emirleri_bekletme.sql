-- 3050 a: açık üretim emri neden ve zamanla bekletilir. Bekletme emrin durumu değildir, durumun üstünde bir işarettir: emrin durumu,
-- sayıları ve onu okuyan modüller değişmez. Yalnız eklenen olay defteri: emrin son olayı 'beklet' ise emir beklemededir.
-- Yeni tablo; var olan satırlar değişmez.
CREATE TABLE uretim_emirleri_bekletme (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL REFERENCES uretim_emri (id),
  olay text NOT NULL CONSTRAINT uretim_emirleri_bekletme_olay CHECK (olay IN ('beklet', 'devam')),
  neden text CONSTRAINT uretim_emirleri_bekletme_neden CHECK (neden IN ('malzeme', 'musteri', 'fason', 'kalite', 'takim', 'diger')),
  not_metni text CONSTRAINT uretim_emirleri_bekletme_not CHECK (not_metni IS NULL OR (btrim(not_metni) <> '' AND length(not_metni) <= 500)),
  kisi_id int NOT NULL REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now(),
  -- Neden yalnız bekletmede vardır ve orada zorunludur; not yalnız bekletmede yazılır.
  CONSTRAINT uretim_emirleri_bekletme_alanlar CHECK ((olay = 'beklet') = (neden IS NOT NULL) AND (olay = 'beklet' OR not_metni IS NULL))
);
CREATE INDEX uretim_emirleri_bekletme_emir_idx ON uretim_emirleri_bekletme (uretim_emri_id, id);
CREATE TRIGGER uretim_emirleri_bekletme_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_bekletme
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_bekletme_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_bekletme
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
