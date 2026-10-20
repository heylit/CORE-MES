-- Reçete ve Rota Motoru, Rota sayfasını gören rollere açılır (kullanıcı kararı, kart #992): planlamayı yapanlar (müdür, planlama)
-- görür ve yazar; kalite ve CAM görür, değişiklikleri sekmede kalır. Operatöre verilmez: operatör yalnız terminal ve kuyruğu
-- görür (kart #713).

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem IN ('sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz');
  RAISE NOTICE 'rol_islemi: % reçete ve rota satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.recete-rota'),
    ('mudur', 'recete-rota.oku'),
    ('mudur', 'recete-rota.yaz'),
    ('planlama_proje', 'sayfa.recete-rota'),
    ('planlama_proje', 'recete-rota.oku'),
    ('planlama_proje', 'recete-rota.yaz'),
    ('kalite', 'sayfa.recete-rota'),
    ('kalite', 'recete-rota.oku'),
    ('cam', 'sayfa.recete-rota'),
    ('cam', 'recete-rota.oku')
  ) AS m (kod, islem);
