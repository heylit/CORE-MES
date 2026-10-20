-- Planlama ve Proje, Çizim Merkezi'nde belge okur, yazar ve yayınlar (kullanıcı kararı 18.10.2026, soru 109 a).

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'planlama_proje'), m.islem
  FROM (VALUES ('cizimler.oku'), ('cizimler.yaz'), ('cizimler.yayinla')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
