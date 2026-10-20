-- Planlama ve Proje, Çizim Merkezi'ni menüde görür ve açar (kullanıcı kararı 19.10.2026, soru 117 a); işlemleri 109 a ile verildi.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'planlama_proje'), m.islem
  FROM (VALUES ('sayfa.cizimler')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
