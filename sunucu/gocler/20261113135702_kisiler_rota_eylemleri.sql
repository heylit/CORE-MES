-- Rota yazımı beş eyleme bölünür (kart 3165, karar 3165 a): `rota.yaz` taşıyan her rol ve kişi beşini birden alır;
-- kimse yetki kazanmaz ya da kaybetmez. Eski işlem SİLİNMEZ (satırlar kalır, hiçbir uç ona bağlı değildir); kaldırılması ayrı karttır.
-- Kişiden alınmış eski işlem (kisi_islem_kisiti) de yeni eylemlere kopyalanır: alınan yetki bölünmeyle geri gelmez.
-- Ekleyici göç: yalnız INSERT; var olan satıra dokunulmaz, yeniden çalışırsa bir şey eklemez.
DO $$
DECLARE rol_once bigint; kisi_once bigint; kisit_once bigint;
BEGIN
  SELECT count(*) INTO rol_once FROM rol_islemi WHERE islem = 'rota.yaz';
  SELECT count(*) INTO kisi_once FROM kisi_islemi WHERE islem = 'rota.yaz';
  SELECT count(*) INTO kisit_once FROM kisi_islem_kisiti WHERE islem = 'rota.yaz';
  RAISE NOTICE 'rota.yaz: % rol, % kişi, % kısıt satırı beş eyleme kopyalanıyor', rol_once, kisi_once, kisit_once;
END $$;

WITH yeni (islem) AS (VALUES
  ('rota.revizyon-yaz'), ('rota.onaya-gonder'), ('rota.sablon-yaz'), ('rota.taslak-ac'), ('rota.sure-kabul')
)
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.rol_id, yeni.islem FROM rol_islemi r CROSS JOIN yeni WHERE r.islem = 'rota.yaz'
ON CONFLICT (rol_id, islem) DO NOTHING;

WITH yeni (islem) AS (VALUES
  ('rota.revizyon-yaz'), ('rota.onaya-gonder'), ('rota.sablon-yaz'), ('rota.taslak-ac'), ('rota.sure-kabul')
)
INSERT INTO kisi_islemi (kisi_id, islem, veren_id, verildi)
SELECT k.kisi_id, yeni.islem, k.veren_id, k.verildi FROM kisi_islemi k CROSS JOIN yeni WHERE k.islem = 'rota.yaz'
ON CONFLICT (kisi_id, islem) DO NOTHING;

WITH yeni (islem) AS (VALUES
  ('rota.revizyon-yaz'), ('rota.onaya-gonder'), ('rota.sablon-yaz'), ('rota.taslak-ac'), ('rota.sure-kabul')
)
INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id, alindi)
SELECT k.kisi_id, yeni.islem, k.alan_id, k.alindi FROM kisi_islem_kisiti k CROSS JOIN yeni WHERE k.islem = 'rota.yaz'
ON CONFLICT (kisi_id, islem) DO NOTHING;
