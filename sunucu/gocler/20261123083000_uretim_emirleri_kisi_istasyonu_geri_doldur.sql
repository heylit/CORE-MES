-- 3607: kişi kaynağı atanırken boşalan istasyonu rotadan geri yazar. Yalnız rotadan gelen (tur = 'rota'), bekleyen, kişi kaynaklı ve
-- istasyonu boş adımlar; ek ve rework adımları dışarıdadır. Rota satırı op_no ile değil operasyon kimliğiyle eşlenir (3250-2: op_no
-- revizyonda yeniden dizilebilir). İstasyon rota satırından gelir (doğrudan istasyon, yoksa makinesinin istasyonu, yoksa operasyon
-- tipinin varsayılan istasyonu); bulunamayan adım boş kalır, uydurulmaz. Emrin istasyonu ilk açık adımdan yeniden yazılır.
-- Tek işlem; değişiklik defteri tetikleyicileri her satırı eski ve yeni değeriyle yazar. Aday, doldurulan ve boş kalan sayısı bildirilir. Geçici tablo kullanılmaz (göç rolünün TEMPORARY hakkı yoktur); hedef sorgusu iki yerde aynıdır.
DO $$
DECLARE
  aday int;
  dolacak int;
BEGIN
  WITH hedef AS (
  SELECT i.id AS is_emri_id,
         (SELECT COALESCE(ra.istasyon_id, m.istasyon_id, t.varsayilan_istasyon_id)
            FROM rota_adimi ra
            LEFT JOIN makine m ON m.id = ra.makine_id
           WHERE ra.revizyon_id = e.kaynak_rota_revizyonu_id AND ra.operasyon_id = i.operasyon_id
           LIMIT 1) AS istasyon_id
    FROM uretim_emirleri_is_emri i
    JOIN uretim_emri e ON e.id = i.uretim_emri_id
    LEFT JOIN istasyonlar_operasyon_tipi t ON t.id = i.operasyon_tipi_id
   WHERE i.tur = 'rota' AND i.durum = 'bekliyor' AND i.kisi_id IS NOT NULL AND i.istasyon_id IS NULL
     AND i.fason_firma_id IS NULL AND NOT i.fason_firmasiz AND i.operasyon_id IS NOT NULL
     AND e.durum IN ('taslak', 'planli', 'basladi')
  )
  SELECT count(*), count(*) FILTER (WHERE istasyon_id IS NOT NULL) INTO aday, dolacak FROM hedef;
  RAISE NOTICE '3607 kişi istasyonu geri doldurma: aday % adım, doldurulacak %, boş kalacak % (rotada istasyonu bulunamayan).', aday, dolacak, aday - dolacak;
END $$;

WITH hedef AS (
  SELECT i.id AS is_emri_id,
         (SELECT COALESCE(ra.istasyon_id, m.istasyon_id, t.varsayilan_istasyon_id)
            FROM rota_adimi ra
            LEFT JOIN makine m ON m.id = ra.makine_id
           WHERE ra.revizyon_id = e.kaynak_rota_revizyonu_id AND ra.operasyon_id = i.operasyon_id
           LIMIT 1) AS istasyon_id
    FROM uretim_emirleri_is_emri i
    JOIN uretim_emri e ON e.id = i.uretim_emri_id
    LEFT JOIN istasyonlar_operasyon_tipi t ON t.id = i.operasyon_tipi_id
   WHERE i.tur = 'rota' AND i.durum = 'bekliyor' AND i.kisi_id IS NOT NULL AND i.istasyon_id IS NULL
     AND i.fason_firma_id IS NULL AND NOT i.fason_firmasiz AND i.operasyon_id IS NOT NULL
     AND e.durum IN ('taslak', 'planli', 'basladi')
)
UPDATE uretim_emirleri_is_emri i SET istasyon_id = h.istasyon_id, surum = i.surum + 1
  FROM hedef h WHERE i.id = h.is_emri_id AND h.istasyon_id IS NOT NULL;

UPDATE uretim_emri e SET istasyon_id = sirada.istasyon_id, surum = e.surum + 1
  FROM (
    SELECT DISTINCT ON (i.uretim_emri_id) i.uretim_emri_id, i.istasyon_id
      FROM uretim_emirleri_is_emri i WHERE i.durum <> 'tamam' ORDER BY i.uretim_emri_id, i.sira
  ) sirada
 WHERE e.id = sirada.uretim_emri_id AND e.istasyon_id IS NULL AND sirada.istasyon_id IS NOT NULL
   AND e.durum IN ('taslak', 'planli', 'basladi');

DO $$
BEGIN
  RAISE NOTICE '3607 kişi istasyonu geri doldurma: kalan kişi kaynaklı bekleyen, istasyonsuz adım %.',
    (SELECT count(*) FROM uretim_emirleri_is_emri WHERE tur = 'rota' AND durum = 'bekliyor' AND kisi_id IS NOT NULL AND istasyon_id IS NULL
        AND fason_firma_id IS NULL AND NOT fason_firmasiz);
END $$;
