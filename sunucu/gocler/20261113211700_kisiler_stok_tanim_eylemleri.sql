-- Stok tanım yazımı dört eyleme bölünür (kart 3165, karar 3165 a): `stok.tanim` taşıyan her rol ve kişi dördünü birden alır;
-- kimse yetki kazanmaz ya da kaybetmez. Eski işlem SİLİNMEZ (satırlar kalır, hiçbir uç ona bağlı değildir); kaldırılması ayrı karttır.
-- Kişiden alınmış eski işlem (kisi_islem_kisiti) de yeni eylemlere kopyalanır: alınan yetki bölünmeyle geri gelmez.
-- Ekleyici göç: yalnız INSERT; var olan satıra dokunulmaz, yeniden çalışırsa bir şey eklemez.
DO $$
DECLARE rol_once bigint; kisi_once bigint; kisit_once bigint;
BEGIN
  SELECT count(*) INTO rol_once FROM rol_islemi WHERE islem = 'stok.tanim';
  SELECT count(*) INTO kisi_once FROM kisi_islemi WHERE islem = 'stok.tanim';
  SELECT count(*) INTO kisit_once FROM kisi_islem_kisiti WHERE islem = 'stok.tanim';
  RAISE NOTICE 'stok.tanim: % rol, % kişi, % kısıt satırı dört eyleme kopyalanıyor', rol_once, kisi_once, kisit_once;
END $$;

WITH yeni (islem) AS (VALUES
  ('stok.konum-yaz'), ('stok.raf-yaz'), ('stok.harita-yaz'), ('stok.malzeme-ayari')
)
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.rol_id, yeni.islem FROM rol_islemi r CROSS JOIN yeni WHERE r.islem = 'stok.tanim'
ON CONFLICT (rol_id, islem) DO NOTHING;

WITH yeni (islem) AS (VALUES
  ('stok.konum-yaz'), ('stok.raf-yaz'), ('stok.harita-yaz'), ('stok.malzeme-ayari')
)
INSERT INTO kisi_islemi (kisi_id, islem, veren_id, verildi)
SELECT k.kisi_id, yeni.islem, k.veren_id, k.verildi FROM kisi_islemi k CROSS JOIN yeni WHERE k.islem = 'stok.tanim'
ON CONFLICT (kisi_id, islem) DO NOTHING;

WITH yeni (islem) AS (VALUES
  ('stok.konum-yaz'), ('stok.raf-yaz'), ('stok.harita-yaz'), ('stok.malzeme-ayari')
)
INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id, alindi)
SELECT k.kisi_id, yeni.islem, k.alan_id, k.alindi FROM kisi_islem_kisiti k CROSS JOIN yeni WHERE k.islem = 'stok.tanim'
ON CONFLICT (kisi_id, islem) DO NOTHING;
