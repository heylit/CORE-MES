-- Bordro onayı (İK v3, kullanıcı kararı 2-a, 12.10.2026): "İK İşlemlerim" sayfasını alan her role verilir. Yönetici rolü bütün
-- işlemleri zaten taşır. Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('insan_kaynaklari', 'ik.bordro-gordum'),
    ('mudur', 'ik.bordro-gordum'),
    ('planlama_proje', 'ik.bordro-gordum'),
    ('operator', 'ik.bordro-gordum'),
    ('kalite', 'ik.bordro-gordum'),
    ('satin_alma', 'ik.bordro-gordum'),
    ('muhasebe_finans', 'ik.bordro-gordum'),
    ('idari_isler', 'ik.bordro-gordum'),
    ('cam', 'ik.bordro-gordum'),
    ('depo', 'ik.bordro-gordum')
  ) AS m (kod, islem);
