-- Planlama ve Proje rotayı kendisi kurar ve planı canlıya alır (kullanıcı kararı 15.10.2026, "Verilsin"): uçtan uca denemede rota
-- adımı ve canlıya alma yalnız yöneticide kaldığı için planlamacı emri sahaya indiremiyordu. Rota onayı (rota.onayla) değişmez.
-- Kalite rolü Kalite Merkezi sayfasını görür; sayfanın ikinci menüsü kalite-merkezi.oku ister, yazma işlemleri değişmez.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('planlama_proje', 'rota.yaz'), ('planlama_proje', 'plan.canliya-al'),
    ('kalite', 'sayfa.kalite-merkezi'), ('kalite', 'kalite-merkezi.oku')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
