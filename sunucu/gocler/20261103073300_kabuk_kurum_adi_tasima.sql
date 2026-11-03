-- Firma adının tek kaynağı Sistem Ayarları > Firma adı'dır (1942 a, 1942 teyit): satın alma ve finansta ayrı tutulan ad bir kez
-- kabuk.kurum-adi'ya taşınır. Ayar elle girilmişse (satır var, 'TMI' ya da boş değil) dokunulmaz. Önce satın alma, o boşsa finans;
-- finansın 'Şirketim' varsayılanı ad sayılmaz; 80 karakteri aşan ad ayarın sınırına sığmadığı için alınmaz.
-- Eski sütunlar silinmez, artık okunmaz. Satırı yazan kişi finans ayarını son değiştiren, yoksa yönetici rolündeki ilk etkin kişidir;
-- ikisi de yoksa (boş kurulum) taşınacak bir şey de yoktur.
WITH aday AS (
  SELECT btrim(ad) AS ad, sira
    FROM (VALUES
      ((SELECT sirket FROM satin_alma_ayar LIMIT 1), 1),
      ((SELECT sirket_adi FROM finans_ayar WHERE sirket_adi <> 'Şirketim' LIMIT 1), 2)
    ) AS k(ad, sira)
   WHERE ad IS NOT NULL AND btrim(ad) <> '' AND length(btrim(ad)) <= 80
   ORDER BY sira
   LIMIT 1
),
yazan AS (
  SELECT COALESCE(
    (SELECT f.guncelleyen_id FROM finans_ayar f JOIN kisi k ON k.id = f.guncelleyen_id WHERE f.guncelleyen_id IS NOT NULL LIMIT 1),
    (SELECT min(k.id) FROM kisi k JOIN kisi_rolu kr ON kr.kisi_id = k.id JOIN rol r ON r.id = kr.rol_id WHERE k.aktif AND r.yonetici)
  ) AS kisi_id
)
INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id)
SELECT 'kabuk.kurum-adi', to_jsonb(aday.ad), yazan.kisi_id
  FROM aday, yazan
 WHERE yazan.kisi_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM ayar WHERE anahtar = 'kabuk.kurum-adi' AND btrim(deger #>> '{}') NOT IN ('', 'TMI')
   )
ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncelleme = now();
