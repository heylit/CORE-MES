-- TMI'ye yazılamayan Arkon kayıtları listesi müdür ve planlama rollerine açılır (#243).
-- `arkon.yansima-oku` Arkon rolü değildir: kişinin Arkon rolünü değiştirmez, bakım ve Arkon göçündeki
-- "elle girilmiş Arkon işlemi" denetimi o göçle bir kez koşmuştur ve bu satırları görmez.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'arkon.yansima-oku'),
    ('planlama_proje', 'arkon.yansima-oku')
  ) AS m (kod, islem);
