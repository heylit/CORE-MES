-- OEE sayfası müdür ve planlama rollerine açılır (kullanıcı kararı 14.10.2026, kart #1330: "müdür, planlama ve planlamacı").
-- Ayrı planlamacı rolü yoktur; planlamacı rolü 20261006092612 göçünde Planlama ve Proje'ye dönüştü. Operatör ve diğer roller
-- görmez; birim maliyet ayrıca finans.maliyet-oku ister ve o işlemin rolleri değişmez.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.oee'), ('mudur', 'oee.oku'),
    ('planlama_proje', 'sayfa.oee'), ('planlama_proje', 'oee.oku')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
