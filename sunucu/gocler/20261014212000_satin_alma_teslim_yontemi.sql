-- Malzemeyi tedarikçi mi getirir, biz mi alırız (kart #1310): "biz alacağız" diyen talebin siparişi sevkiyat bekleme listesine alım olarak düşer.
-- Boş: belirtilmedi (eski talepler ve seçim yapılmamış talep).
ALTER TABLE satin_alma_talep
  ADD COLUMN teslim_yontemi text CONSTRAINT satin_alma_talep_teslim_yontemi CHECK (teslim_yontemi IN ('firma_getirir', 'biz_alacagiz'));
