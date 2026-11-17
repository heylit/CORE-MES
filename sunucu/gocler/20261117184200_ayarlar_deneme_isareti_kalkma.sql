-- İşaret kalkınca kayıt listeye döner; önbellekli liste (malzeme kataloğu) yalnız değişenleri okur ve kartın güncelleme anı
-- değişmez. Türe göre son kalkma anı tutulur: liste o andan önceki "değişenler" okumasını tam okumaya çevirir (3395-3 Risk K1).
CREATE TABLE ayarlar_deneme_isareti_kalkma (
  tur text PRIMARY KEY CHECK (tur IN ('uretim_emri', 'siparis', 'malzeme')),
  zaman timestamptz NOT NULL
);

-- Bütün kaldırma yolları (elle, tarihle, temizlikten sonra) tek yerden yazar.
CREATE FUNCTION ayarlar_deneme_isareti_kalkti() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  INSERT INTO ayarlar_deneme_isareti_kalkma (tur, zaman)
  SELECT DISTINCT tur, now() FROM eski
  ON CONFLICT (tur) DO UPDATE SET zaman = excluded.zaman;
  RETURN NULL;
END $$;

CREATE TRIGGER ayarlar_deneme_isareti_kalkti AFTER DELETE ON ayarlar_deneme_isareti
  REFERENCING OLD TABLE AS eski FOR EACH STATEMENT EXECUTE FUNCTION ayarlar_deneme_isareti_kalkti();
