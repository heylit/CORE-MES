-- 2398 a: dört göz talebin şimdiye kadarki bütün talep edenlerine bakar. Talep eden sonradan değiştirilebildiği için
-- (satın almayı yazan, onayda da) yalnız güncel sütuna bakmak kendini çıkarıp onaylamaya izin veriyordu (Güvenlik ön bakışı).
-- Yalnız ekleme: bir kişi bir kez girer, çıkmaz. Var olan talepler açan ve güncel talep edenle doldurulur; önceki
-- talep edenler kayıtta yoktur, bilinemez.
CREATE TABLE satin_alma_talep_eden_gecmisi (
  talep_id uuid NOT NULL REFERENCES satin_alma_talep (id) ON DELETE CASCADE,
  kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (talep_id, kisi_id)
);
CREATE INDEX satin_alma_talep_eden_gecmisi_kisi ON satin_alma_talep_eden_gecmisi (kisi_id);

INSERT INTO satin_alma_talep_eden_gecmisi (talep_id, kisi_id)
  SELECT id, talep_eden_kisi_id FROM satin_alma_talep
  UNION SELECT id, acan_kisi_id FROM satin_alma_talep
  ON CONFLICT DO NOTHING;
