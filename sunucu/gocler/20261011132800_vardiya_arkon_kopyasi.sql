-- A7 (#517, kullanıcı kararı 4-a): Arkon'da girilmiş vardiyalar Vardiya modülüne bir kez kopyalanır; Arkon artık vardiyayı buradan okur.
-- Aynı adlı vardiya varsa Vardiya'daki kalır. Arkon belgesi silinmez ve değişmez (yalnız okunur). Biçimi bozuk satır atlanır.
WITH ham AS (
  SELECT e.deger, e.sira
  FROM arkon_belge b,
       jsonb_array_elements(CASE WHEN jsonb_typeof(b.govde -> 'v') = 'array' THEN b.govde -> 'v' ELSE '[]'::jsonb END) WITH ORDINALITY AS e(deger, sira)
  WHERE b.depo = 'kv' AND b.kimlik = 'shifts'
), gecerli AS (
  SELECT DISTINCT ON (btrim(deger ->> 'name'))
         btrim(deger ->> 'name') AS ad, (deger ->> 'start')::time AS baslangic, (deger ->> 'end')::time AS bitis, deger -> 'breaks' AS molalar
  FROM ham
  WHERE jsonb_typeof(deger) = 'object'
    AND btrim(coalesce(deger ->> 'name', '')) <> '' AND char_length(btrim(deger ->> 'name')) <= 40
    AND coalesce(deger ->> 'start', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND coalesce(deger ->> 'end', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND deger ->> 'start' <> deger ->> 'end'
  ORDER BY btrim(deger ->> 'name'), sira
), eklenen AS (
  INSERT INTO vardiya (ad, baslangic, bitis)
  SELECT ad, baslangic, bitis FROM gecerli
  ON CONFLICT ON CONSTRAINT vardiya_ad_tekil DO NOTHING
  RETURNING id, ad
)
INSERT INTO vardiya_molasi (vardiya_id, baslangic, bitis)
SELECT e.id, (m ->> 'at')::time, (m ->> 'at')::time + make_interval(mins => (m ->> 'min')::int)
FROM eklenen e
JOIN gecerli g ON g.ad = e.ad,
     jsonb_array_elements(CASE WHEN jsonb_typeof(g.molalar) = 'array' THEN g.molalar ELSE '[]'::jsonb END) AS m
WHERE jsonb_typeof(m) = 'object'
  AND coalesce(m ->> 'at', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND (CASE WHEN coalesce(m ->> 'min', '') ~ '^[0-9]{1,4}$' THEN (m ->> 'min')::int ELSE 0 END) BETWEEN 1 AND 1439;
