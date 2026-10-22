-- Devam ve mesai kaydını onaylamak ayrı işlemdir: kaydı giren kendi kaydını onaylamaz (kullanıcı kararı 22.10.2026, soru 105 a ve 115 a).
-- Yönetici rolü bütün işlemleri zaten taşır.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES ('insan_kaynaklari', 'ik.devam-onay'), ('mudur', 'ik.devam-onay')) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
