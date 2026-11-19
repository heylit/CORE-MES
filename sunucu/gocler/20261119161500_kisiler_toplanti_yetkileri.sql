-- 3448-5 a (kullanıcı kararı 19.11.2026): yöneten roller toplantı açar ve yönetir; bütün toplantıları yalnız üst yönetim görür.
-- Katılımcı kendi toplantısını her rolde zaten görür (Profilim > Toplantılarım); bu göç yalnız ekler.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('genel_mudur', 'sayfa.toplantilar'),
    ('genel_mudur', 'toplantilar.yaz'),
    ('genel_mudur', 'toplantilar.oku'),
    ('genel_mudur_yardimcisi', 'sayfa.toplantilar'),
    ('genel_mudur_yardimcisi', 'toplantilar.yaz'),
    ('genel_mudur_yardimcisi', 'toplantilar.oku'),
    ('mudur', 'sayfa.toplantilar'),
    ('mudur', 'toplantilar.yaz'),
    ('mudur', 'toplantilar.oku'),
    ('planlama_muduru', 'sayfa.toplantilar'),
    ('planlama_muduru', 'toplantilar.yaz'),
    ('uretim_muduru', 'sayfa.toplantilar'),
    ('uretim_muduru', 'toplantilar.yaz'),
    ('satin_alma_muduru', 'sayfa.toplantilar'),
    ('satin_alma_muduru', 'toplantilar.yaz'),
    ('planlama_proje', 'sayfa.toplantilar'),
    ('planlama_proje', 'toplantilar.yaz')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
