-- 1968 a: yeni üretim emri plana yeni iş getirir; emir tetiği eklemeyi de yazar (denetim modülünün ortak tetik işlevi). Planlama
-- sayfası değişiklik akışını buradan okur (1962). Güncelleme ve silme önceki gibi düşer.
DROP TRIGGER uretim_emri_degisiklik ON uretim_emri;
CREATE TRIGGER uretim_emri_degisiklik AFTER INSERT OR UPDATE OR DELETE ON uretim_emri
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');
