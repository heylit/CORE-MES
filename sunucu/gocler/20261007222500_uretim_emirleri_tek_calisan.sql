-- İstasyonda aynı anda tek çalışan (ya da durdurulmuş) emir: yalnız duraklamış emir istasyonu kilitlemez.
-- Çalışma hâli olay defterinden türer ama kısmi benzersiz dizin başka tabloya bakamaz; bu yüzden sütun olay
-- eklenince tetikleyiciyle güncellenir (tek yazım yolu: servis dışı ekleme de sütunu tutarlı tutar).
ALTER TABLE uretim_emri
  ADD COLUMN calisma text NOT NULL DEFAULT 'calisiyor'
  CONSTRAINT uretim_emri_calisma_degeri CHECK (calisma IN ('calisiyor', 'durakli', 'durdu'));

-- Yalnız yeni sütun doldurulur; başlamış emrin hâli son olaydan alınır (olay yoksa çalışıyordur).
UPDATE uretim_emri e
   SET calisma = CASE o.olay WHEN 'duraklat' THEN 'durakli' WHEN 'durdur' THEN 'durdu' ELSE 'calisiyor' END
  FROM (SELECT DISTINCT ON (emir_id) emir_id, olay FROM uretim_olayi ORDER BY emir_id, id DESC) o
 WHERE o.emir_id = e.id AND e.durum = 'basladi';

-- Yeni kural eskisinden gevşektir (eski dizin istasyonda tek başlamış emre izin veriyordu); var olan veri
-- ihlal etmez, etse dizin kurulamaz ve göç durur.
DROP INDEX uretim_emri_istasyonda_tek_basladi;
CREATE UNIQUE INDEX uretim_emri_istasyonda_tek_kilitleyen ON uretim_emri (istasyon_id)
  WHERE durum = 'basladi' AND calisma <> 'durakli';

CREATE FUNCTION uretim_olayi_calisma_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE uretim_emri
     SET calisma = CASE NEW.olay WHEN 'duraklat' THEN 'durakli' WHEN 'durdur' THEN 'durdu' ELSE 'calisiyor' END
   WHERE id = NEW.emir_id;
  RETURN NULL;
END
$$;

CREATE TRIGGER uretim_olayi_calisma AFTER INSERT ON uretim_olayi
  FOR EACH ROW EXECUTE FUNCTION uretim_olayi_calisma_yaz();
