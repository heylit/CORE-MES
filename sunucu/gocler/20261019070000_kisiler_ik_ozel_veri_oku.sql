-- Kan grubu ve engel durumu KVKK'da özel nitelikli kişisel veridir; yalnız İK görür (kullanıcı kararı 19.10.2026, soru 88 a).
-- Yönetici rolü bütün işlemleri zaten taşır.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'insan_kaynaklari'), m.islem
  FROM (VALUES ('ik.ozel-veri-oku')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
