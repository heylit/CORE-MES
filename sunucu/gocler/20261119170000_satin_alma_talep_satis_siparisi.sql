-- 3429-3 F3: satış siparişinin "Satın al" kalemi onayda satın almanın ön talep listesine düşer; talebe çevrilen kalem bu bağı taşır.
-- Boş: satış siparişine bağlı değil (var olan kalemler dahil, veri dönüştürülmez). Bağlı kalem siparişte kilitlidir (SIP-19); iptal
-- edilmiş talepteki bağ satırın silinmesini durdurmaz, boşalır.
ALTER TABLE satin_alma_talep_kalemi
  ADD COLUMN satis_siparis_satiri_id int CONSTRAINT satin_alma_talep_kalemi_satis_siparis_satiri REFERENCES siparisler_siparis_satiri ON DELETE SET NULL;
CREATE INDEX satin_alma_talep_kalemi_satis_siparis_satiri ON satin_alma_talep_kalemi (satis_siparis_satiri_id) WHERE satis_siparis_satiri_id IS NOT NULL;
