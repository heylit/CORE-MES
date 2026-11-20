-- 3442-7b a: onay basamağına kişi yazılır; o kişi rolü olmasa da o basamağı ve alttakileri onaylar (satın alma onaylama yetkisi yine gerekir).
-- Basamaklar her kayıtta baştan yazılır: kişi satırları basamakla birlikte silinir (CASCADE). Basamakta yazılı kişi silinemez (RESTRICT):
-- silinse basamak sessizce gevşerdi (rol_id ile aynı gerekçe).
CREATE TABLE satin_alma_onay_limiti_kisi (
  sira smallint NOT NULL REFERENCES satin_alma_onay_limiti ON DELETE CASCADE,
  kisi_id int NOT NULL REFERENCES kisi ON DELETE RESTRICT,
  PRIMARY KEY (sira, kisi_id)
);
CREATE INDEX satin_alma_onay_limiti_kisi_kisi ON satin_alma_onay_limiti_kisi (kisi_id);
