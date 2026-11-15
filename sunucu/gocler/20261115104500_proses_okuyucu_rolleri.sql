-- Proses parça dosyasını dört rol daha okur (kart 3290-1, kullanıcı kararı 3290-1 a): üretim müdürü, kalite, planlama ve proje,
-- müdür. Yalnız okuma işlemi ve sayfa; dosya hiçbir şey yazmaz. Göç yalnız satır ekler, var olan satıra dokunmaz.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = r.kod), m.islem
  FROM (VALUES ('uretim_muduru'), ('kalite'), ('planlama_proje'), ('mudur')) AS r (kod)
 CROSS JOIN (VALUES ('proses.oku'), ('sayfa.proses')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
