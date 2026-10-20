-- Operatör girişte ve "Ana sayfa"da kendi panosunu (Özetim kısası, terminale geçiş düğmesiyle) açar (kullanıcı isteği 15.10.2026).
-- Yalnız göçün yazdığı değer boşaltılır: elle başka sayfa seçilmişse dokunulmaz.
UPDATE rol SET acilis_sayfasi = NULL WHERE kod = 'operator' AND acilis_sayfasi = '/uretim-terminali';
