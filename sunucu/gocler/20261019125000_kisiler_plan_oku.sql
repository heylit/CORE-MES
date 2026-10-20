-- Planı, senaryoları ve menü sayaçlarını yalnız planlama, müdür, vardiya sorumlusu, CAM, kalite ve bakım görür (kullanıcı kararı 280 a,
-- 20.10.2026). Yönetici bayraklı rol bütün kayıtlı işlemleri kendiliğinden alır; hiçbir rolden işlem alınmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('planlama_proje', 'plan.oku'), ('mudur', 'plan.oku'), ('vardiya_sorumlusu', 'plan.oku'),
    ('cam', 'plan.oku'), ('kalite', 'plan.oku'), ('bakim', 'plan.oku')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
