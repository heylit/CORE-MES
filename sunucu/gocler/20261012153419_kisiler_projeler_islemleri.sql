-- Projeler rol x işlem satırları (kullanıcı onayı "Öneri", 12.10.2026, kart #852): müdür ve planlama projeleri görür ve yazar;
-- satın alma, kalite, depo ve CAM yalnız görür. Üretim, operatör ve finans görmez. Yönetici her işlemi bayrakla taşır, satır yazılmaz.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.projeler'), ('mudur', 'projeler.oku'), ('mudur', 'projeler.yaz'),
    ('planlama_proje', 'sayfa.projeler'), ('planlama_proje', 'projeler.oku'), ('planlama_proje', 'projeler.yaz'),
    ('satin_alma', 'sayfa.projeler'), ('satin_alma', 'projeler.oku'),
    ('kalite', 'sayfa.projeler'), ('kalite', 'projeler.oku'),
    ('depo', 'sayfa.projeler'), ('depo', 'projeler.oku'),
    ('cam', 'sayfa.projeler'), ('cam', 'projeler.oku')
  ) AS m (kod, islem);
