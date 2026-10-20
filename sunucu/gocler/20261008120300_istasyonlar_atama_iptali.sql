-- Kişi bir tarihten çıkarılınca aynı hedefteki daha ileri tarihli planlı atamaları da iptal olur (E3k): yoksa çıkarılan kişi
-- ileri tarihli satır gününde sessizce geri gelirdi. İptal edilen satır silinmez, iptal zamanıyla kalır ve hiçbir hesaba girmez.
-- Aynı güne yeni atama iptal satırının üstüne yazmaz, yeni satır açar: benzersizlik yalnız iptal edilmemiş satırlardadır.
ALTER TABLE istasyon_kisi ADD COLUMN iptal_zamani timestamptz;
ALTER TABLE istasyon_kisi DROP CONSTRAINT istasyon_kisi_pkey;
ALTER TABLE istasyon_kisi ADD COLUMN id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE UNIQUE INDEX istasyon_kisi_gecerli_satir ON istasyon_kisi (istasyon_id, kisi_id, baslangic) WHERE iptal_zamani IS NULL;

ALTER TABLE makine_kisi ADD COLUMN iptal_zamani timestamptz;
ALTER TABLE makine_kisi DROP CONSTRAINT makine_kisi_pkey;
ALTER TABLE makine_kisi ADD COLUMN id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE UNIQUE INDEX makine_kisi_gecerli_satir ON makine_kisi (makine_id, kisi_id, baslangic) WHERE iptal_zamani IS NULL;

ALTER TABLE ekip_uye ADD COLUMN iptal_zamani timestamptz;
ALTER TABLE ekip_uye DROP CONSTRAINT ekip_uye_pkey;
ALTER TABLE ekip_uye ADD COLUMN id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE UNIQUE INDEX ekip_uye_gecerli_satir ON ekip_uye (ekip_id, kisi_id, baslangic) WHERE iptal_zamani IS NULL;
