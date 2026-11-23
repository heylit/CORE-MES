-- 3607: kişi kaynağı atanırken boşalan istasyonu rotadan geri yazar. Yalnız bekleyen, kişi kaynaklı ve istasyonu boş adımlar; istasyon
-- adımın rota satırından (doğrudan istasyon, yoksa makinesinin istasyonu, yoksa operasyon tipinin varsayılan istasyonu) gelir; bulunamayan
-- adım boş kalır, uydurulmaz. Emrin istasyonu sıradaki adımdan yeniden yazılır. Değişiklik defteri tetikleyicileri (iş emri ve emir
-- tablolarında) her satırı eski ve yeni değeriyle deftere yazar; tek işlemdir.
WITH hedef AS (
  SELECT i.id AS is_emri_id,
         COALESCE(ra.istasyon_id, m.istasyon_id, t.varsayilan_istasyon_id) AS istasyon_id
    FROM uretim_emirleri_is_emri i
    JOIN uretim_emri e ON e.id = i.uretim_emri_id
    JOIN rota_adimi ra ON ra.revizyon_id = e.kaynak_rota_revizyonu_id AND ra.op_no = i.op_no
    LEFT JOIN makine m ON m.id = ra.makine_id
    LEFT JOIN istasyonlar_operasyon_tipi t ON t.id = i.operasyon_tipi_id
   WHERE i.durum = 'bekliyor' AND i.kisi_id IS NOT NULL AND i.istasyon_id IS NULL
     AND i.fason_firma_id IS NULL AND NOT i.fason_firmasiz AND e.durum IN ('taslak', 'planli', 'basladi')
)
UPDATE uretim_emirleri_is_emri i SET istasyon_id = h.istasyon_id, surum = i.surum + 1
  FROM hedef h WHERE i.id = h.is_emri_id AND h.istasyon_id IS NOT NULL;

UPDATE uretim_emri e SET istasyon_id = sirada.istasyon_id, surum = e.surum + 1
  FROM (
    SELECT DISTINCT ON (i.uretim_emri_id) i.uretim_emri_id, i.istasyon_id
      FROM uretim_emirleri_is_emri i WHERE i.durum <> 'tamam' ORDER BY i.uretim_emri_id, i.sira
  ) sirada
 WHERE e.id = sirada.uretim_emri_id AND e.istasyon_id IS NULL AND sirada.istasyon_id IS NOT NULL AND e.durum IN ('taslak', 'planli', 'basladi');
