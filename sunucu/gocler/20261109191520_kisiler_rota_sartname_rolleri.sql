-- İşlem şartnamesini yazmak ve yayınlamak kalite ve planlama rollerine verilir (2491 c): bugün yalnız yönetici yazabiliyor.
-- Planlama iki roldür (planlama_muduru, planlama_proje). Göç yalnız satır ekler; elle verilmiş satır korunur.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('kalite', 'rota.sartname-yaz'),
    ('kalite', 'rota.sartname-yayinla'),
    ('planlama_muduru', 'rota.sartname-yaz'),
    ('planlama_muduru', 'rota.sartname-yayinla'),
    ('planlama_proje', 'rota.sartname-yaz'),
    ('planlama_proje', 'rota.sartname-yayinla')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
