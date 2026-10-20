-- Fabrika haritası rol x işlem satırları (kullanıcı onayı "Hepsi onay", 11 Ekim, kart #599): müdür, planlama, kalite, CAM, depo ve
-- operatör sayfayı görür; yerleşimi yalnız planlama düzenler. Yönetici her işlemi bayrakla taşır, satır yazılmaz.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.atolye'),
    ('planlama_proje', 'sayfa.atolye'), ('planlama_proje', 'atolye.yaz'),
    ('kalite', 'sayfa.atolye'),
    ('cam', 'sayfa.atolye'),
    ('depo', 'sayfa.atolye'),
    ('operator', 'sayfa.atolye')
  ) AS m (kod, islem);
