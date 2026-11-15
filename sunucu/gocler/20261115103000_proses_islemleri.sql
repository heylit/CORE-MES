-- Proses modülü parça dosyası (kart 3290, kullanıcı kararları 3277-5 a ve 3277-4 a): sayfa ve okuma işlemi proses mühendisine verilir.
-- Öteki roller bu sayfayı ancak kullanıcı kararıyla alır; yönetici bayraklı rol olarak zaten görür. Göç yalnız satır ekler.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'proses_muhendisi'), m.islem
  FROM (VALUES ('proses.oku'), ('sayfa.proses')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
