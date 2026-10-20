-- Etiket Merkezi'ni basan dört rol menüde görür ve açar (kullanıcı kararı 19.10.2026, soru 123 a); işlemleri 99 ile verildi.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), 'sayfa.etiket-merkezi'
  FROM (VALUES ('depo'), ('planlama_proje'), ('kalite'), ('mudur')) AS m (kod)
ON CONFLICT (rol_id, islem) DO NOTHING;
