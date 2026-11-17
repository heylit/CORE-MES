-- İrsaliye no yükleme anında kesilir (3348-1 a): onaylı plandaki işte de belge_no değişebilir; öteki alanlar kilitli kalır.
CREATE OR REPLACE FUNCTION sevkiyat_onayli_plandaki_is_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  durum_alanlari text[] := ARRAY['durum', 'durum_zamani', 'tarih', 'surum', 'tetiklendi', 'tetikleyen_kisi_id', 'onaylayan_kisi_id', 'sonuc_kisi_id', 'belge_no'];
BEGIN
  IF OLD.durum IN ('yolda', 'tamamlandi') AND (to_jsonb(NEW) - durum_alanlari) <> (to_jsonb(OLD) - durum_alanlari) THEN
    RAISE EXCEPTION 'Yoldaki ya da tamamlanmış iş değiştirilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_onayli_plandaki_is_degismez';
  END IF;
  RETURN NEW;
END $$;
