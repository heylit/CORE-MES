-- Üretim Hazırlık kuyruk sırasını yazar (kart 527, 522 2 a): CAM ve planlama rollerine açılır. `arkon.kuyruk-sirala` Arkon rolü değildir:
-- kişinin Arkon rolünü değiştirmez. Yönetici rolü bütün işlemleri taşır, satır gerekmez.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('cam', 'arkon.kuyruk-sirala'),
    ('planlama_proje', 'arkon.kuyruk-sirala')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
