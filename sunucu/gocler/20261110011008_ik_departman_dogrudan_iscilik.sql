-- 2647 a: departman "doğrudan işçilik" (üretimde istasyonda çalışır) işareti. NULL = işaretlenmedi: varsayılan false eski
-- departmanları dolaylı sayıp istasyon saatinde sayılan maaşı genel gidere de yazardı, true dolaylı personeli sıfırlardı.
ALTER TABLE ik_departman ADD COLUMN dogrudan_iscilik boolean;
