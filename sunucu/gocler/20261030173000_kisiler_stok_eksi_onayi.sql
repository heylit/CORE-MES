-- 1387 a (kart 1414): elle eksiye düşüm onayı ve hareket geri alma depo rolünden çıkar, ayrı iki işlem olarak yalnız müdürdedir.
-- Depo kendi hareketini geri alamaz. Terminalin ve akışların ürettiği otomatik eksi bu onayın dışındadır.
-- Kişiye verilmiş ek işlemlere (kisi_islemi) dokunulmaz; yönetici bayraklı roldür, satır taşımaz.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE r.kod = 'depo' AND ri.islem = 'stok.geri-al';
  RAISE NOTICE 'rol_islemi: depo rolunden % stok.geri-al satiri silinir; mudure stok.eksi-onayla eklenir.', n;
END $$;

DELETE FROM rol_islemi WHERE islem = 'stok.geri-al' AND rol_id = (SELECT id FROM rol WHERE kod = 'depo');

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'stok.eksi-onayla')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
