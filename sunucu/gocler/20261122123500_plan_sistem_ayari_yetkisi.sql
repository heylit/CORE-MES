-- Plan motorunun ufku ve zaman dilimi Planlama ayarları sayfasından değişir (3557 c, 3560): planlama müdürü plan.sistem-ayari ile yalnız
-- bu ikisini değiştirir. Dört göz, tipli girdi ve bakım girdisi ayarlar.yaz'da (yönetici) kalır. Göç yalnız satır ekler.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES ('planlama_muduru', 'plan.sistem-ayari')) AS m (kod, islem)
 WHERE EXISTS (SELECT 1 FROM rol WHERE kod = m.kod)
ON CONFLICT (rol_id, islem) DO NOTHING;
