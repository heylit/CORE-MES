-- Ayar olayı: terminalde ayarın başladığı an; gerçekleşen hazırlık ayar başı ile başlatma arasıdır.
-- Kısıt yalnız genişler, var olan satır değişmez.
ALTER TABLE uretim_olayi DROP CONSTRAINT uretim_olayi_olay_degeri;
ALTER TABLE uretim_olayi ADD CONSTRAINT uretim_olayi_olay_degeri CHECK (olay IN ('duraklat', 'durdur', 'devam', 'ayar'));

-- Ayar başlamamış emirde yazılır; çalışma hâline dokunmaz (yoksa planlı emir çalışıyor görünürdü).
CREATE OR REPLACE FUNCTION uretim_olayi_calisma_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.olay = 'ayar' THEN RETURN NULL; END IF;
  UPDATE uretim_emri
     SET calisma = CASE NEW.olay WHEN 'duraklat' THEN 'durakli' WHEN 'durdur' THEN 'durdu' ELSE 'calisiyor' END
   WHERE id = NEW.emir_id;
  RETURN NULL;
END
$$;
