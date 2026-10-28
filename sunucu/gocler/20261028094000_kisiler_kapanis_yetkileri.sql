-- Emir kapanışı rol yetkileri (kullanıcı kararı 1078 a, okuma teyitli; 28.10.2026).
-- Kalite onayını kalite, müdür onayını (ret, muafiyet, geri açma dahil) müdür verir; Kapanış onayları sayfasını bu iki rol ve planlama görür.
-- Yalnız ekler, hiçbir rolden işlem almaz. Yönetici rolü bütün işlemleri zaten taşır. İki rolü olan kişi iki onayı da verir (1077 b).
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('kalite', 'uretim-emirleri.kapanis-oku'),
    ('kalite', 'uretim-emirleri.kapanis-kalite'),
    ('mudur', 'uretim-emirleri.kapanis-oku'),
    ('mudur', 'uretim-emirleri.kapanis-onay'),
    ('planlama_proje', 'uretim-emirleri.kapanis-oku')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
