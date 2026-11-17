-- 3401-1 a: alış fiyatını, teklif ve sipariş tutarını ayrı işlem açar; satın alma oku'su planlamaya fiyatsız kalır.
-- Plan öncelik ayarını yazma planlama müdüründen kalkar (okuma da maliyet ya da bedel ayarı ister); müdürlerde kalır.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'satin-alma.fiyat-oku'),
    ('genel_mudur', 'satin-alma.fiyat-oku'),
    ('genel_mudur_yardimcisi', 'satin-alma.fiyat-oku'),
    ('satin_alma_muduru', 'satin-alma.fiyat-oku'),
    ('satin_alma', 'satin-alma.fiyat-oku'),
    ('muhasebe_finans', 'satin-alma.fiyat-oku')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;

DELETE FROM rol_islemi
 WHERE islem = 'plan.bedel-ayari'
   AND rol_id = (SELECT id FROM rol WHERE kod = 'planlama_muduru');
