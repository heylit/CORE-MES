-- 392 a: üretim emri ve iş emrinin her güncellemesi ve silinmesi eski ve yeni değeriyle değişiklik defterine düşer
-- (denetim modülünün ortak tetik işlevi). Ekleme yazılmaz: yeni emrin kaydı satırın kendisidir.
-- `surum` her yazımda artar; tek başına değişikliği anlatmaz, defterde gürültü olur.
CREATE TRIGGER uretim_emri_degisiklik AFTER UPDATE OR DELETE ON uretim_emri
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');

CREATE TRIGGER uretim_emirleri_is_emri_degisiklik AFTER UPDATE OR DELETE ON uretim_emirleri_is_emri
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');
