-- İki kişi aynı noktayı, aracı ya da işi düzenleyebilir: güncelleme açtığı sürümle gelir, arada değişen kayıt üzerine yazılmaz (kart #1323).
ALTER TABLE sevkiyat_noktasi ADD COLUMN surum integer NOT NULL DEFAULT 1;
ALTER TABLE sevkiyat_araci ADD COLUMN surum integer NOT NULL DEFAULT 1;
ALTER TABLE sevkiyat_isi ADD COLUMN surum integer NOT NULL DEFAULT 1;

-- Yoldaki ya da tamamlanmış işte durum değişimi sürümü de artırır; sürüm içerik sayılmaz.
CREATE OR REPLACE FUNCTION sevkiyat_onayli_plandaki_is_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  durum_alanlari text[] := ARRAY['durum', 'durum_zamani', 'tarih', 'surum'];
BEGIN
  IF OLD.durum IN ('yolda', 'tamamlandi') AND (to_jsonb(NEW) - durum_alanlari) <> (to_jsonb(OLD) - durum_alanlari) THEN
    RAISE EXCEPTION 'Yoldaki ya da tamamlanmış iş değiştirilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_onayli_plandaki_is_degismez';
  END IF;
  RETURN NEW;
END $$;
