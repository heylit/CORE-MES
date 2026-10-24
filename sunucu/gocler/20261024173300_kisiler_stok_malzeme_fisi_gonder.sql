-- Malzeme fişini Logo'ya elle gönderme ve hatalı fişi yeniden gönderme (295 a, 299 a; kart #492, #495): depo rolüne verilir.
-- Yönetici bayraklı roldür, satır taşımaz. Yetki matrisinde ayrı "depo sorumlusu" rolü yoktur; depo işini yapan kişi `depo` rolünü taşır (299 a).

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('depo', 'stok.malzeme-fisi-gonder')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
