-- Yükleme parçaları kişi başına şerittir (anahtar: özet, yükleyen, sıra): aynı özeti iki kişi birbirini engellemeden yükler. Var olan parçalar sahipsiz yarım yüklemelerdir (geçici veri, bir günde zaten silinir) ve atılır.
DELETE FROM arkon_dosya_parcasi;
ALTER TABLE arkon_dosya_parcasi ADD COLUMN yukleyen_id int NOT NULL REFERENCES kisi;
ALTER TABLE arkon_dosya_parcasi DROP CONSTRAINT arkon_dosya_parcasi_pkey;
ALTER TABLE arkon_dosya_parcasi ADD CONSTRAINT arkon_dosya_parcasi_pkey PRIMARY KEY (ozet, yukleyen_id, sira);
