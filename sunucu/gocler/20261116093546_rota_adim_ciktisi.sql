-- Ara adımın çıktısı (3320 a): adım bitince parça statülü ara hâl yerine seçilen yarı mamul ya da mamul kartına girer, sonraki adım onu tüketir.
-- Kayıt zamanında revizyonun her adımına satır yazılır (statülü adımda cikti_malzeme_id boş): satırı olmayan revizyon bu tablodan önce
-- yazılmıştır, çıktısı eski bağdan (recete_rota_adim_bagi) okunur. Kart silinemez (RESTRICT); içerik kilidi adımın diğer alt tablolarıyla aynıdır.
CREATE TABLE rota_adim_ciktisi (
  adim_id int PRIMARY KEY REFERENCES rota_adimi,
  cikti_malzeme_id int REFERENCES malzeme_katalog_karti (no) ON DELETE RESTRICT
);
CREATE INDEX rota_adim_ciktisi_malzeme ON rota_adim_ciktisi (cikti_malzeme_id) WHERE cikti_malzeme_id IS NOT NULL;
CREATE TRIGGER rota_adim_ciktisi_kilitli BEFORE INSERT OR UPDATE OR DELETE ON rota_adim_ciktisi
  FOR EACH ROW EXECUTE FUNCTION rota_icerik_kilitli();
