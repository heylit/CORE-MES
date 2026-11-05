-- Sevkiyat noktalarının bir kerelik doldurulması (kart 2133; kararlar 2133-1 b, 2133-2 a, 2133-4 a). Şema değişmez, yalnız satır eklenir.
-- Bundan sonra nokta firma ya da fabrika ayarı kaydedilince sunucuda açılır; bu göç o kural gelmeden önce kaydedilmiş firmalar içindir.
-- Yeniden koşarsa aynı noktayı ikinci kez eklemez: aktif noktası olan firma atlanır, teklik çakışması satırı düşürür.

-- Aktif noktası olmayan aktif firma; konum merkez adresinden, yoksa teslim, şube, fatura adresinden (sevkiyat kurallar.ts otomatikKonumSec).
-- Koordinatı olmayan firmaya nokta açılmaz (2133-2 a); Noktalar ekranında "konum eksik" listesinde görünür.
WITH konum AS (
  SELECT f.id AS firma_id, NULL::int AS adres_id, f.adres, f.enlem, f.boylam, 0 AS sira, 0 AS adres_sira
    FROM musteri_tedarikci_firma f
   WHERE f.enlem IS NOT NULL AND f.boylam IS NOT NULL
  UNION ALL
  SELECT a.firma_id, a.id, a.adres, a.enlem, a.boylam, CASE a.tur WHEN 'teslim' THEN 1 WHEN 'sube' THEN 2 ELSE 3 END, a.id
    FROM musteri_tedarikci_adres a
   WHERE a.enlem IS NOT NULL AND a.boylam IS NOT NULL
),
secilen AS (
  SELECT DISTINCT ON (k.firma_id) k.* FROM konum k ORDER BY k.firma_id, k.sira, k.adres_sira
),
aday AS (
  SELECT f.id, f.kod, left(btrim(f.ad), 100) AS ad,
         CASE WHEN f.fason THEN 'fason' WHEN f.tur = 'tedarikci' THEN 'tedarikci' ELSE 'musteri' END AS tur,
         s.adres_id, nullif(btrim(s.adres), '') AS adres, s.enlem, s.boylam
    FROM musteri_tedarikci_firma f
    JOIN secilen s ON s.firma_id = f.id
   WHERE f.aktif
     AND NOT EXISTS (SELECT 1 FROM sevkiyat_noktasi n WHERE n.aktif AND n.firma_id = f.id)
),
adli AS (
  -- Ad aktif noktalarda tekildir: başka nokta ya da başka aday aynı adı taşıyorsa firmanın kodu (yoksa numarası) eklenir.
  SELECT a.*,
         CASE WHEN EXISTS (SELECT 1 FROM sevkiyat_noktasi n WHERE n.aktif AND lower(n.ad) = lower(a.ad))
                OR count(*) OVER (PARTITION BY lower(a.ad)) > 1
              THEN a.ad || ' (' || coalesce(nullif(btrim(a.kod), ''), '#' || a.id) || ')'
              ELSE a.ad END AS nokta_adi
    FROM aday a
)
INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, adres, durak_suresi_dakika, firma_id, adres_id)
SELECT nokta_adi, tur, enlem, boylam, adres, 20, id, adres_id FROM adli ORDER BY id
ON CONFLICT DO NOTHING;

-- Fabrika: Sistem Ayarları'nda enlem ve boylam doluysa ve aktif fabrika yoksa açılır (2133-4 a); adres ayarı varsa o yazılır.
WITH ayar_degeri AS (
  SELECT (SELECT deger FROM ayar WHERE anahtar = 'sevkiyat.fabrika-enlem') AS enlem,
         (SELECT deger FROM ayar WHERE anahtar = 'sevkiyat.fabrika-boylam') AS boylam,
         (SELECT deger FROM ayar WHERE anahtar = 'sevkiyat.fabrika-adres') AS adres
)
INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, adres, durak_suresi_dakika)
SELECT CASE WHEN EXISTS (SELECT 1 FROM sevkiyat_noktasi n WHERE n.aktif AND lower(n.ad) = 'fabrika') THEN 'Fabrika (rota çıkışı)' ELSE 'Fabrika' END,
       'fabrika', (enlem #>> '{}')::numeric, (boylam #>> '{}')::numeric,
       CASE WHEN jsonb_typeof(adres) = 'string' THEN nullif(btrim(adres #>> '{}'), '') END, 20
  FROM ayar_degeri
 WHERE jsonb_typeof(enlem) = 'number' AND jsonb_typeof(boylam) = 'number'
   AND (enlem #>> '{}')::numeric BETWEEN -90 AND 90 AND (boylam #>> '{}')::numeric BETWEEN -180 AND 180
   AND NOT EXISTS (SELECT 1 FROM sevkiyat_noktasi n WHERE n.tur = 'fabrika' AND n.aktif)
ON CONFLICT DO NOTHING;
