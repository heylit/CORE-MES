-- 898 a, 905 a: talep kalemi iki bağ taşır; ikisi de boş başlar, var olan satırlar değişmez.
-- uygulanan_malzeme_no: hizmet hangi parça ya da malzeme üzerinde yapılacak (teklif isterken firmaya giden bilgi).
-- is_emri_id: kalem hangi fason iş emri için istendi; bağlı kalem varken o iş emri ön talep olarak yeniden düşmez. İş emri silinirse
-- talep kalır, bağ boşalır (sipariş satırının bağı silmeyi engeller; talep henüz sipariş değildir).
ALTER TABLE satin_alma_talep_kalemi
  ADD COLUMN uygulanan_malzeme_no int CONSTRAINT satin_alma_talep_kalemi_uygulanan REFERENCES malzeme_katalog_karti (no),
  ADD COLUMN is_emri_id int CONSTRAINT satin_alma_talep_kalemi_is_emri REFERENCES uretim_emirleri_is_emri ON DELETE SET NULL;
CREATE INDEX satin_alma_talep_kalemi_is_emri ON satin_alma_talep_kalemi (is_emri_id) WHERE is_emri_id IS NOT NULL;
