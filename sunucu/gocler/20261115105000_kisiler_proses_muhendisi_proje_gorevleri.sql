-- 3269-3 b (kullanıcı kartı, 15.11.2026): Proses Mühendisi proje görevini işler ve kontrol eder. Kişi yalnız kendisine ya da
-- rolüne atanan görevi işler ve kontrolü onaylar (kayıt düzeyi kural sunucuda); işlem tek başına başkasının görevini açmaz.
-- Göç yalnız satır ekler. Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'proses_muhendisi'), m.islem
  FROM (VALUES ('projeler.gorev-isle'), ('projeler.gorev-kontrol'), ('sayfa.proje-gorevlerim')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
