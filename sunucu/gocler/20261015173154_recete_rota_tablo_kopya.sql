-- Reçete ve Rota ana durum kaydındaki (recete_rota_kayit, anahtar recete-rota-motoru-v1) statü tanımları, adım bağları, giren statüleri ve
-- statülü kartlar taşıma tablolarına bir kez kopyalanır (kullanıcı onayı 15.10.2026). Kural sunucudaki jsondanSatirlar ve
-- tasimaTablolariniEsitle ile aynıdır: tablonun kuralına uymayan, kartı katalogda olmayan ya da tanımlı olmayan statüye bağlanan değer
-- kopyalanmaz. JSON kaydı değişmez; sonraki yazımlar tabloları sunucu eşitler.
DO $$
DECLARE
  belge jsonb;
  yazan int;
BEGIN
  SELECT deger, guncelleyen_kisi_id INTO belge, yazan FROM recete_rota_kayit WHERE anahtar = 'recete-rota-motoru-v1' AND bicim = 'json';
  IF belge IS NULL OR jsonb_typeof(belge) <> 'object' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM kisi WHERE id = yazan) THEN SELECT min(id) INTO yazan FROM kisi; END IF;
  IF yazan IS NULL THEN RETURN; END IF;

  -- Statü tanımları: geçerli olanların ilki (kimlik başına).
  INSERT INTO recete_rota_statu_tanimi (kimlik, kod, ad, tur, renk, sira, guncelleyen_kisi_id)
  SELECT DISTINCT ON (kimlik) kimlik, kod, ad, tur, renk, sira, yazan
    FROM (
      SELECT e.s->>'id' AS kimlik,
             CASE WHEN jsonb_typeof(e.s->'code') = 'string' AND btrim(e.s->>'code') <> '' THEN e.s->>'code' ELSE e.s->>'id' END AS kod,
             CASE WHEN jsonb_typeof(e.s->'name') = 'string' AND btrim(e.s->>'name') <> '' THEN e.s->>'name' ELSE e.s->>'id' END AS ad,
             CASE WHEN jsonb_typeof(e.s->'kind') = 'string' THEN e.s->>'kind' ELSE '' END AS tur,
             CASE WHEN jsonb_typeof(e.s->'color') = 'string' THEN e.s->>'color' ELSE '' END AS renk,
             (e.n - 1)::int AS sira
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(belge->'statuses') = 'array' THEN belge->'statuses' ELSE '[]'::jsonb END)
             WITH ORDINALITY AS e(s, n)
       WHERE jsonb_typeof(e.s) = 'object' AND jsonb_typeof(e.s->'id') = 'string' AND btrim(e.s->>'id') <> ''
    ) x
   WHERE kimlik ~ '^[A-Za-z0-9_-]{1,40}$' AND btrim(kod) <> '' AND length(kod) <= 5 AND btrim(ad) <> ''
     AND tur IN ('uretim', 'kalite', 'ret', 'giris') AND renk ~ '^#[0-9A-Fa-f]{6}$'
   ORDER BY kimlik, sira;

  -- Ürünün adımları sayımın okuduğu sırayla: önce routes, sonra yürürlükteki revizyon, sonra öteki revizyonlar (dizideki sırasıyla).
  -- OP numarası adım kimliğinden (<malzeme>-o<no>, eski o<no>), yoksa adımın opNo alanından; aynı OP'nin ilk adımı geçerlidir.
  -- Geçici tablo açılmaz (uygulama rolünün yetkisi yok): adım seçimi ve iki ekleme tek komuttadır.
  WITH kaynak AS (
    SELECT r.key AS urun, 0 AS ks, 0::bigint AS rs, r.value->'steps' AS steps
      FROM jsonb_each(CASE WHEN jsonb_typeof(belge->'routes') = 'object' THEN belge->'routes' ELSE '{}'::jsonb END) r
     WHERE jsonb_typeof(r.value) = 'object'
    UNION ALL
    SELECT v.r->>'itemId', CASE WHEN v.r->>'status' = 'yururlukte' THEN 1 ELSE 2 END, v.n, v.r->'data'->'steps'
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(belge->'routeRevs') = 'array' THEN belge->'routeRevs' ELSE '[]'::jsonb END)
           WITH ORDINALITY AS v(r, n)
     WHERE jsonb_typeof(v.r) = 'object' AND jsonb_typeof(v.r->'itemId') = 'string' AND btrim(v.r->>'itemId') <> ''
       AND jsonb_typeof(v.r->'data') = 'object'
  ),
  adim AS (
    SELECT k.urun, k.ks, k.rs, a.n AS sira, a.s,
           CASE WHEN jsonb_typeof(a.s->'id') = 'string' AND (a.s->>'id') ~ '(^|-)o[0-9]{1,9}$'
                THEN substring(a.s->>'id' FROM '(?:^|-)o([0-9]{1,9})$')::int
                WHEN jsonb_typeof(a.s->'opNo') = 'number' AND (a.s->>'opNo') ~ '^[1-9][0-9]{0,8}$' THEN (a.s->>'opNo')::int END AS op_no
      FROM kaynak k
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(k.steps) = 'array' THEN k.steps ELSE '[]'::jsonb END) WITH ORDINALITY AS a(s, n)
     WHERE jsonb_typeof(a.s) = 'object'
  ),
  secilen AS (
    SELECT DISTINCT ON (urun, op_no) urun, op_no, s
      FROM adim
     WHERE op_no > 0
     ORDER BY urun, op_no, ks, rs, sira
  ),
  tasima_adim AS (
    SELECT * FROM secilen t
     WHERE t.urun ~ '^[1-9][0-9]{0,8}$' AND EXISTS (SELECT 1 FROM malzeme_katalog_karti k WHERE k.no = t.urun::int)
  ),
  bag AS (
  INSERT INTO recete_rota_adim_bagi (malzeme_id, op_no, cikti_malzeme_id, cikti_statu, guncelleyen_kisi_id)
  SELECT m, op_no, c, st, yazan
    FROM (
      SELECT t.urun::int AS m, t.op_no,
             (SELECT k.no FROM malzeme_katalog_karti k
               WHERE jsonb_typeof(t.s->'outItem') = 'string' AND (t.s->>'outItem') ~ '^[1-9][0-9]{0,8}$' AND k.no = (t.s->>'outItem')::int) AS c,
             (SELECT d.kimlik FROM recete_rota_statu_tanimi d
               WHERE jsonb_typeof(t.s->'outStatus') = 'string' AND btrim(t.s->>'outStatus') <> '' AND d.kimlik = t.s->>'outStatus') AS st
        FROM tasima_adim t
    ) x
   WHERE c IS NOT NULL OR st IS NOT NULL
  )
  -- Giren statüsü: adımın girdisinde statü yazılıysa, giren kart başına ilk girdi.
  INSERT INTO recete_rota_giren_statusu (malzeme_id, op_no, giren_malzeme_id, statu, giren_op_no, guncelleyen_kisi_id)
  SELECT m, op_no, g, st, gop, yazan
    FROM (
      SELECT DISTINCT ON (m, op_no, g) m, op_no, g, deger, sira
        FROM (
          SELECT t.urun::int AS m, t.op_no, (i.g->>'itemId')::int AS g, i.g->>'status' AS deger, i.n AS sira
            FROM tasima_adim t
            CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.s->'ins') = 'array' THEN t.s->'ins' ELSE '[]'::jsonb END)
                 WITH ORDINALITY AS i(g, n)
           WHERE jsonb_typeof(i.g) = 'object' AND jsonb_typeof(i.g->'status') = 'string' AND btrim(i.g->>'status') <> ''
             AND jsonb_typeof(i.g->'itemId') = 'string' AND (i.g->>'itemId') ~ '^[1-9][0-9]{0,8}$'
        ) y
       ORDER BY m, op_no, g, sira
    ) z
    CROSS JOIN LATERAL (
      SELECT CASE WHEN z.deger LIKE 'step:%' THEN NULL ELSE z.deger END AS st,
             CASE WHEN z.deger ~ '^step:[0-9]{1,9}-o[0-9]{1,9}$' AND substring(z.deger FROM '^step:([0-9]+)-')::int = z.g
                  THEN substring(z.deger FROM '-o([0-9]+)$')::int END AS gop
    ) c
   WHERE EXISTS (SELECT 1 FROM malzeme_katalog_karti k WHERE k.no = z.g)
     AND ((c.st IS NOT NULL AND EXISTS (SELECT 1 FROM recete_rota_statu_tanimi d WHERE d.kimlik = c.st)) OR c.gop > 0);

  -- Statülü kartlar: kart ve statü başına bir satır.
  INSERT INTO recete_rota_statu_karti (malzeme_id, statu, guncelleyen_kisi_id)
  SELECT DISTINCT (e.k->>'itemId')::int, e.k->>'status', yazan
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(belge->'statusCards') = 'array' THEN belge->'statusCards' ELSE '[]'::jsonb END) AS e(k)
   WHERE jsonb_typeof(e.k) = 'object' AND jsonb_typeof(e.k->'itemId') = 'string' AND (e.k->>'itemId') ~ '^[1-9][0-9]{0,8}$'
     AND jsonb_typeof(e.k->'status') = 'string' AND btrim(e.k->>'status') <> ''
     AND EXISTS (SELECT 1 FROM malzeme_katalog_karti k WHERE k.no = (e.k->>'itemId')::int)
     AND EXISTS (SELECT 1 FROM recete_rota_statu_tanimi d WHERE d.kimlik = e.k->>'status');
END $$;
