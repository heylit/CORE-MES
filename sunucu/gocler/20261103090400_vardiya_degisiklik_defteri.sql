-- 1968 a: vardiya, mola, hafta düzeni, kişi vardiyası, tatil, planlı duruş ve fazla mesai planın takvimidir; ekleme dahil
-- değişiklik defterine düşer (denetim modülünün ortak tetik işlevi). Planlama sayfası değişiklik akışını buradan okur (1962).
-- Yazan ve yazılma zamanı satırdadır, defter kişiyi oturum değişkeninden alır: o sütunlar deftere girmez.
CREATE TRIGGER vardiya_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');

CREATE TRIGGER vardiya_molasi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_molasi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id');

CREATE TRIGGER vardiya_matrisi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_matrisi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('is_merkezi_id,gun,vardiya_id');

CREATE TRIGGER vardiya_kisi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_kisi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('kisi_id');

CREATE TRIGGER vardiya_takvim_gunu_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_takvim_gunu
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('tarih');

CREATE TRIGGER vardiya_planli_durus_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_planli_durus
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum', 'yazan_id', 'yazildi');

CREATE TRIGGER vardiya_fazla_mesai_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_fazla_mesai
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum', 'yazan_id', 'yazildi');

CREATE TRIGGER vardiya_fazla_mesai_kisi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_fazla_mesai_kisi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('fazla_mesai_id,kisi_id');
