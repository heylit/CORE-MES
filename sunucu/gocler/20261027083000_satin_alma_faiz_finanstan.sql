-- Faizin ve kurun tek kaynağı finansın tablolarıdır (kullanıcı kararı 937 b, 939 a): satın almanın kendi faiz sütunu ve
-- kullanılmayan kur tarihi düşer. Kullanıcı değerlerin dökümsüz düşmesini onayladı; sütunu okuyan kod yoktur.
ALTER TABLE satin_alma_kur DROP COLUMN aylik_faiz_yuzdesi;
ALTER TABLE satin_alma_ayar DROP COLUMN kur_tarihi;
