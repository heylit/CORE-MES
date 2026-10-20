-- Bekleyen iş emrinin işaretlenmemiş kontrol listesi talimatın kopyasıdır, iz taşımaz: rota değişikliği onu silip yeniden yazabilsin (soru 76).
-- İşaretlenmiş, başlamış iş emrinin ya da iş emirsiz emrin listesi eskisi gibi değişmez. Satır değişmez.
CREATE FUNCTION emir_adimi_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_emri_id IS NOT NULL THEN
    -- İş emri aynı anda başlatılmasın diye satırı kilitlenir; başlatma bu işlem bitene kadar bekler.
    PERFORM 1 FROM uretim_emirleri_is_emri WHERE id = OLD.is_emri_id AND durum = 'bekliyor' FOR SHARE;
    IF FOUND AND NOT EXISTS (SELECT 1 FROM emir_adimi_olayi WHERE adim_id = OLD.id) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION '% tablosuna yalnız ekleme yapılır', TG_TABLE_NAME;
END $$;

DROP TRIGGER emir_adimi_degismez ON emir_adimi;
CREATE TRIGGER emir_adimi_degismez BEFORE UPDATE OR DELETE ON emir_adimi
  FOR EACH ROW EXECUTE FUNCTION emir_adimi_degismez();
