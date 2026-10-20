-- Akış Süresi sayfası (kart #1338, kullanıcı kararı 2026-10-14 "müdür ve planlamaya açılsın"): sayfa.akis müdür ve
-- planlama_proje rollerine verilir. Yönetici rolü bütün işlemleri zaten taşır.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır; ekrandan önceden verilmiş satır korunur.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = r.kod), 'sayfa.akis'
  FROM (VALUES ('mudur'), ('planlama_proje')) AS r (kod)
ON CONFLICT DO NOTHING;
