-- 1968 a: istasyonun plan ayarı (verim, operatör ihtiyacı) ve makine durumu (arıza, bakım) planın kapasitesidir; ekleme dahil
-- değişiklik defterine düşer (denetim modülünün ortak tetik işlevi). Yeni istasyon plana yeni kaynak getirir: istasyon tetiği
-- eklemeyi de yazar. Planlama sayfası değişiklik akışını buradan okur (1962). Değiştiren kişi ve zaman satırdadır, defter kişiyi
-- oturum değişkeninden alır: o sütunlar deftere girmez.
CREATE TRIGGER istasyonlar_plan_ayari_degisiklik AFTER INSERT OR UPDATE OR DELETE ON istasyonlar_plan_ayari
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('istasyon_id', 'surum', 'degistiren_kisi_id', 'degisme');

CREATE TRIGGER istasyonlar_makine_durumu_degisiklik AFTER INSERT OR UPDATE OR DELETE ON istasyonlar_makine_durumu
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('makine_id', 'surum', 'degistiren_kisi_id', 'degisme');

DROP TRIGGER istasyon_degisiklik ON istasyon;
CREATE TRIGGER istasyon_degisiklik AFTER INSERT OR UPDATE OR DELETE ON istasyon
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');
