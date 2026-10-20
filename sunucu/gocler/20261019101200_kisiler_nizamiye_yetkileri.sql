-- Nizamiye işlemleri güvenlik görevlisine, idari işlere ve müdüre verilir (kullanıcı kararları 174 a ve 182 a, 19.10.2026).
-- Kapı kaydını görevli ve idari işler yazar; ziyaretçi kartlarını idari işler ve müdür yönetir.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('guvenlik_gorevlisi', 'sayfa.nizamiye'), ('guvenlik_gorevlisi', 'nizamiye.oku'), ('guvenlik_gorevlisi', 'nizamiye.yaz'),
    ('idari_isler', 'sayfa.nizamiye'), ('idari_isler', 'nizamiye.oku'), ('idari_isler', 'nizamiye.yaz'), ('idari_isler', 'nizamiye.kart-yonet'),
    ('mudur', 'sayfa.nizamiye'), ('mudur', 'nizamiye.oku'), ('mudur', 'nizamiye.kart-yonet')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
