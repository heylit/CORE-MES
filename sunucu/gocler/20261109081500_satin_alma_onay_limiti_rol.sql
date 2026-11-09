-- 2397 b: onay basamağının rolü (boş: satın alma onaylama yetkisi yeter). Yalnız sütun eklenir; var olan satırlar boş kalır.
-- Basamakta kullanılan rol silinemez (RESTRICT): silinse basamak rolsüz kalır ve denetim sessizce gevşerdi.
ALTER TABLE satin_alma_onay_limiti ADD COLUMN rol_id int REFERENCES rol ON DELETE RESTRICT;
