-- 3321 S2 a ve S4 (öneri a): süre kalibrasyonundan parça çıkarma (geometri.kalibrasyon) Proses Mühendisi'nde; Yönetici bayraklı rol
-- olarak satırsız alır. Göç yalnız satır ekler. Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'proses_muhendisi'), 'geometri.kalibrasyon'
ON CONFLICT (rol_id, islem) DO NOTHING;
