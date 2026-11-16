-- 3337-2 a: refakat kartı okutulmadan iş adımını gerekçeyle başlatmak; varsayılan yönetici (bayraklı) ve üretim müdürü.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES ('uretim_muduru', 'uretim-emirleri.kartsiz-baslat')) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
