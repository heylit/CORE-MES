-- Bakım ve sevkiyat rolleri de "İK İşlemlerim" sayfasını alır (kullanıcı kararı 12.10.2026, "1-a"): kendi izin talebini, mesaisini
-- ve bordro onayını yürütür. Öteki rollerle aynı üç işlem. Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('bakim', 'sayfa.ik-islemlerim'), ('bakim', 'ik.izin-talep'), ('bakim', 'ik.bordro-gordum'),
    ('sevkiyat', 'sayfa.ik-islemlerim'), ('sevkiyat', 'ik.izin-talep'), ('sevkiyat', 'ik.bordro-gordum')
  ) AS m (kod, islem);
