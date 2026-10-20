-- Etiket Merkezi: depo, planlama, kalite ve müdür etiket görür ve basar; şablonu ve yazıcıyı yalnız müdür düzenler
-- (kullanıcı kararı 18.10.2026, soru 99). Yönetici bayraklıdır, satır almaz; operatöre verilmez.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('depo', 'etiket-merkezi.oku'), ('depo', 'etiket-merkezi.bas'),
    ('planlama_proje', 'etiket-merkezi.oku'), ('planlama_proje', 'etiket-merkezi.bas'),
    ('kalite', 'etiket-merkezi.oku'), ('kalite', 'etiket-merkezi.bas'),
    ('mudur', 'etiket-merkezi.oku'), ('mudur', 'etiket-merkezi.bas'),
    ('mudur', 'etiket-merkezi.sablon-yaz'), ('mudur', 'etiket-merkezi.yazici-yaz')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
