-- Rol, kişinin girişte açılacak sayfasını taşır (kullanıcı kararı 11.10.2026, kart #568); boşsa ana sayfa açılır.
-- Yalnız sütun eklenir: var olan satırlar boş kalır, operatör rolüne üretim terminali yazılır.
ALTER TABLE rol ADD COLUMN acilis_sayfasi text
  CONSTRAINT rol_acilis_sayfasi_bicimi CHECK (acilis_sayfasi ~ '^/[a-z0-9-]+(/[a-z0-9-]+)*$');

UPDATE rol SET acilis_sayfasi = '/uretim-terminali' WHERE kod = 'operator';
