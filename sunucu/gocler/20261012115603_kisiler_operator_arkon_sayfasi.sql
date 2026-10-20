-- Operatör yalnız terminal ve kuyruğu görür (kullanıcı kararı 12.10.2026, madde 5; kart #775). Arkon okuma uçları terminal ve kuyruk
-- sayfasıyla da açıldığı için Arkon MES sayfası operatörden kalkar; Arkon işlemi (`arkon.operator`) kalır.
DELETE FROM rol_islemi
 WHERE rol_id = (SELECT id FROM rol WHERE kod = 'operator')
   AND islem = 'sayfa.arkon';
