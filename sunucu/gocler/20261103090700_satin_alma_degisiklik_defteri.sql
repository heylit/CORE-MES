-- 1968 a: satın alma siparişinin beklenen teslimi, satırının miktarı ve malzemenin tedarik termini planın malzeme gelişidir;
-- ekleme dahil değişiklik defterine düşer (denetim modülünün ortak tetik işlevi). Planlama sayfası değişiklik akışını buradan okur
-- (1962). Logo gönderim durumu ve hatası teknik eşitleme sütunudur, sık değişir ve planı etkilemez: deftere girmez; yalnız onlar
-- değişirse satır yazılmaz. Termin satırındaki kişi ve zaman satırdadır, defter kişiyi oturum değişkeninden alır.
CREATE TRIGGER satin_alma_siparis_degisiklik AFTER INSERT OR UPDATE OR DELETE ON satin_alma_siparis
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('talep_id,teklif_id',
    'logo_kayit_no', 'logo_gonderim_durumu', 'logo_gonderim_zamani', 'logo_hata', 'logo_iptal_durumu', 'logo_iptal_hata',
    'logo_guncelleme_durumu', 'logo_guncelleme_hata', 'logo_kaldirilan_satir_refleri', 'logo_kapatma_durumu', 'logo_kapatma_hata');

CREATE TRIGGER satin_alma_siparis_satiri_degisiklik AFTER INSERT OR UPDATE OR DELETE ON satin_alma_siparis_satiri
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'logo_satir_ref', 'logo_karsilama_ref', 'logo_karsilama_durumu', 'logo_karsilama_hata');

CREATE TRIGGER satin_alma_tedarik_termini_degisiklik AFTER INSERT OR UPDATE OR DELETE ON satin_alma_tedarik_termini
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('malzeme_no', 'surum', 'kisi_id', 'guncelleme');
