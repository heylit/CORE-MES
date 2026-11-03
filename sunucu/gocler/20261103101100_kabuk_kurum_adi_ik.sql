-- Firma adı kaynak sırası İK > Satın alma > Finans'tır (1942 teyit). 20261103073300 göçü İK'ya bakmadan satın alma ya da finans adını
-- yazdı; İK'da ad varsa öncelik onundur. İK adı (ik_genel_ayar.sirket) yalnız şu durumda kabuk.kurum-adi'ya yazılır: ayar yok, boş ya da
-- 'TMI'; ya da son yazımı o göçün kendisidir (aynı işlemde yazıldığı için guncelleme = goc_kaydi.uygulandi). Sonradan elle girilmiş ada
-- dokunulmaz. 80 karakteri aşan ad ayarın sınırına sığmadığı için alınmaz. İK sütunu silinmez, artık okunmaz. Satırı yazan kişi İK
-- ayarını son değiştirendir, yoksa yönetici rolündeki ilk etkin kişi.
WITH ik AS (
  SELECT btrim(sirket) AS ad, guncelleyen_kisi_id
    FROM ik_genel_ayar
   WHERE anahtar = 'genel' AND sirket IS NOT NULL AND btrim(sirket) <> '' AND length(btrim(sirket)) <= 80
),
yazan AS (
  SELECT COALESCE(
    (SELECT k.id FROM ik JOIN kisi k ON k.id = ik.guncelleyen_kisi_id),
    (SELECT min(k.id) FROM kisi k JOIN kisi_rolu kr ON kr.kisi_id = k.id JOIN rol r ON r.id = kr.rol_id WHERE k.aktif AND r.yonetici)
  ) AS kisi_id
),
tasima AS (
  SELECT uygulandi FROM goc_kaydi WHERE ad = '20261103073300_kabuk_kurum_adi_tasima.sql'
)
INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id)
SELECT 'kabuk.kurum-adi', to_jsonb(ik.ad), yazan.kisi_id
  FROM ik, yazan
 WHERE yazan.kisi_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM ayar a
      WHERE a.anahtar = 'kabuk.kurum-adi'
        AND (btrim(a.deger #>> '{}') = ik.ad
             OR (btrim(a.deger #>> '{}') NOT IN ('', 'TMI') AND a.guncelleme IS DISTINCT FROM (SELECT uygulandi FROM tasima)))
   )
ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncelleme = now();
