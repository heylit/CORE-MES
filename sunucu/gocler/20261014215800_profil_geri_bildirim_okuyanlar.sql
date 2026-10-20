-- Şikayet, istek ve öneri kayıtlarını müdür ve İnsan Kaynakları okur (kullanıcı kararı 14.10.2026, yazılı onay proje sohbetinde).
-- Kayıtlar adla tutulur; öteki roller yalnız kendi gönderdiklerini profilde görür.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'profil.geri-bildirim-oku'),
    ('insan_kaynaklari', 'profil.geri-bildirim-oku')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
