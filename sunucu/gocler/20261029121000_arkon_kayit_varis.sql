-- Kayıt zamanı tabletin zamanıdır (12 saate kadar geri esas, kart #215); sunucunun kaydı aldığı an ayrıca saklanır ki geri tarihlenen
-- kayıt sonradan ayırt edilebilsin. Var olan satırlarda an bilinmediğinden boş kalır (doldurma yok); tablo yalnız eklemedir.
ALTER TABLE arkon_kayit ADD COLUMN varis timestamptz;
