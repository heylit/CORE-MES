-- Güvenlik görevlisinin işi kapıdadır (karar NZM-5 a, teyit 1808): girişte Ana sayfa yerine Kapı açılır.
-- Yöneticinin rol için seçtiği bir açılış sayfası varsa değişmez.
UPDATE rol SET acilis_sayfasi = '/nizamiye' WHERE kod = 'guvenlik_gorevlisi' AND acilis_sayfasi IS NULL;
