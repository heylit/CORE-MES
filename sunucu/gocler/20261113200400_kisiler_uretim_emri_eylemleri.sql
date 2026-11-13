-- Üretim emri yazımı sekiz eyleme bölünür (kart 3165, kararlar 3165 a ve 3207 a): `uretim-emirleri.yaz` taşıyan her rol ve kişi sekizini birden alır;
-- kimse yetki kazanmaz ya da kaybetmez. Eski işlem SİLİNMEZ (satırlar kalır, hiçbir uç ona bağlı değildir); kaldırılması ayrı karttır.
-- Kişiden alınmış eski işlem (kisi_islem_kisiti) de yeni eylemlere kopyalanır: alınan yetki bölünmeyle geri gelmez.
-- Ekleyici göç: yalnız INSERT; var olan satıra dokunulmaz, yeniden çalışırsa bir şey eklemez.
DO $$
DECLARE rol_once bigint; kisi_once bigint; kisit_once bigint;
BEGIN
  SELECT count(*) INTO rol_once FROM rol_islemi WHERE islem = 'uretim-emirleri.yaz';
  SELECT count(*) INTO kisi_once FROM kisi_islemi WHERE islem = 'uretim-emirleri.yaz';
  SELECT count(*) INTO kisit_once FROM kisi_islem_kisiti WHERE islem = 'uretim-emirleri.yaz';
  RAISE NOTICE 'uretim-emirleri.yaz: % rol, % kişi, % kısıt satırı sekiz eyleme kopyalanıyor', rol_once, kisi_once, kisit_once;
END $$;

WITH yeni (islem) AS (VALUES
  ('uretim-emirleri.emir-ac'), ('uretim-emirleri.rotasiz-ac'), ('uretim-emirleri.duzenle'), ('uretim-emirleri.adim-yaz'),
  ('uretim-emirleri.bol-birlestir'), ('uretim-emirleri.plana-al'), ('uretim-emirleri.beklet'), ('uretim-emirleri.iptal')
)
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.rol_id, yeni.islem FROM rol_islemi r CROSS JOIN yeni WHERE r.islem = 'uretim-emirleri.yaz'
ON CONFLICT (rol_id, islem) DO NOTHING;

WITH yeni (islem) AS (VALUES
  ('uretim-emirleri.emir-ac'), ('uretim-emirleri.rotasiz-ac'), ('uretim-emirleri.duzenle'), ('uretim-emirleri.adim-yaz'),
  ('uretim-emirleri.bol-birlestir'), ('uretim-emirleri.plana-al'), ('uretim-emirleri.beklet'), ('uretim-emirleri.iptal')
)
INSERT INTO kisi_islemi (kisi_id, islem, veren_id, verildi)
SELECT k.kisi_id, yeni.islem, k.veren_id, k.verildi FROM kisi_islemi k CROSS JOIN yeni WHERE k.islem = 'uretim-emirleri.yaz'
ON CONFLICT (kisi_id, islem) DO NOTHING;

WITH yeni (islem) AS (VALUES
  ('uretim-emirleri.emir-ac'), ('uretim-emirleri.rotasiz-ac'), ('uretim-emirleri.duzenle'), ('uretim-emirleri.adim-yaz'),
  ('uretim-emirleri.bol-birlestir'), ('uretim-emirleri.plana-al'), ('uretim-emirleri.beklet'), ('uretim-emirleri.iptal')
)
INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id, alindi)
SELECT k.kisi_id, yeni.islem, k.alan_id, k.alindi FROM kisi_islem_kisiti k CROSS JOIN yeni WHERE k.islem = 'uretim-emirleri.yaz'
ON CONFLICT (kisi_id, islem) DO NOTHING;
