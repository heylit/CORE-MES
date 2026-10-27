-- 955 b: müşteri sınıfı çarpanları (265 a) 815'ten beri hiçbir hesapta okunmaz; plana yalnız üretim emrinin önceliği girer.
-- Sütunlar canlı ayardan ve taslak kopyasından kalkar; değerleri saklanmaz. Sütunun kendi CHECK kısıtı sütunla birlikte düşer.
ALTER TABLE plan_ayari DROP COLUMN sinif_a_carpani, DROP COLUMN sinif_b_carpani, DROP COLUMN sinif_c_carpani;
ALTER TABLE plan_senaryo_bedel_ayari DROP COLUMN sinif_a_carpani, DROP COLUMN sinif_b_carpani, DROP COLUMN sinif_c_carpani;
