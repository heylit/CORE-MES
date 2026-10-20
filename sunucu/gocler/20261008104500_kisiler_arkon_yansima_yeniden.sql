-- TMI'ye yazılamayan Arkon kaydını yeniden deneme müdür ve planlama rollerine açılır (#243, kullanıcı kararı Y1 a).
-- `arkon.yansima-yeniden` Arkon rolü değildir: kişinin Arkon rolünü değiştirmez.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'arkon.yansima-yeniden'),
    ('planlama_proje', 'arkon.yansima-yeniden')
  ) AS m (kod, islem);
