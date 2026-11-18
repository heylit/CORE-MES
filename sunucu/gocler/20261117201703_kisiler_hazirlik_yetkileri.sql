-- 3396-2 a ve 3396-4 a: hazırlık ayarı üretim müdüründe (yönetici bayrakla alır); hazırlık dağıtımı planlama, üretim müdürü ve
-- proses mühendisinde. Üretim müdürü ve proses mühendisi Proje > Hazırlık matrisini açabilsin diye proje okuma da alır.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('planlama_muduru', 'projeler.hazirlik-dagit'),
    ('planlama_proje', 'projeler.hazirlik-dagit'),
    ('uretim_muduru', 'projeler.hazirlik-dagit'),
    ('uretim_muduru', 'uretim-emirleri.hazirlik-ayar'),
    ('uretim_muduru', 'projeler.oku'),
    ('uretim_muduru', 'sayfa.projeler'),
    ('proses_muhendisi', 'projeler.hazirlik-dagit'),
    ('proses_muhendisi', 'projeler.oku'),
    ('proses_muhendisi', 'sayfa.projeler')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
