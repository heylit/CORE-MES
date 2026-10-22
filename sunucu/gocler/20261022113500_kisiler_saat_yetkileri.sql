-- Saatten uyarı üstlenme rolleri (Soru 111 b, 22.10.2026): müdür, planlama, kalite, vardiya sorumlusu ve bakım üstlenir. Vardiya
-- sorumlusu ve bakım emir listesini ve Fabrika Haritası'nı açmadığı için saatteki okumayı ayrı işlemle alır (`saat.oku`).
-- Yönetici bayraklı rol bütün kayıtlı işlemleri kendiliğinden alır; hiçbir rolden işlem alınmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'saat.uyari-ustlen'), ('planlama_proje', 'saat.uyari-ustlen'), ('kalite', 'saat.uyari-ustlen'),
    ('vardiya_sorumlusu', 'saat.uyari-ustlen'), ('vardiya_sorumlusu', 'saat.oku'),
    ('bakim', 'saat.uyari-ustlen'), ('bakim', 'saat.oku')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
