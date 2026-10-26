-- Planlama sayfalarını görme işleminin sahibi plan modülüdür (658 b, 663 a): `recete-rota.planlama-oku` taşıyan her rol ve kişi
-- `plan.planlama-oku`'yu alır, eski ad silinir; kimse yetki kazanmaz ya da kaybetmez. Planlama ana menüde plan modülünün sayfasıdır
-- (`sayfa.plan`); planlama sayfalarını gören müdür ve planlamaya verilir (yönetici bayraklı rol, satır taşımaz).
DO $$
DECLARE rol_once bigint; kisi_once bigint;
BEGIN
  SELECT count(*) INTO rol_once FROM rol_islemi WHERE islem = 'recete-rota.planlama-oku';
  SELECT count(*) INTO kisi_once FROM kisi_islemi WHERE islem = 'recete-rota.planlama-oku';
  RAISE NOTICE 'recete-rota.planlama-oku: % rol, % kişi satırı yeni ada geçiyor', rol_once, kisi_once;
END $$;

INSERT INTO rol_islemi (rol_id, islem)
SELECT rol_id, 'plan.planlama-oku' FROM rol_islemi WHERE islem = 'recete-rota.planlama-oku'
ON CONFLICT (rol_id, islem) DO NOTHING;
DELETE FROM rol_islemi WHERE islem = 'recete-rota.planlama-oku';

INSERT INTO kisi_islemi (kisi_id, islem, veren_id, verildi)
SELECT kisi_id, 'plan.planlama-oku', veren_id, verildi FROM kisi_islemi WHERE islem = 'recete-rota.planlama-oku'
ON CONFLICT (kisi_id, islem) DO NOTHING;
DELETE FROM kisi_islemi WHERE islem = 'recete-rota.planlama-oku';

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.plan'),
    ('planlama_proje', 'sayfa.plan')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
