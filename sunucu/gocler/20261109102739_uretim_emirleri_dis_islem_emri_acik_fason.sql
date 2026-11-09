-- 2428-3 a: canlıdaki açık fason işlerine dış işlem emri açılır. Yalnız ekler; var olan hiçbir satır değişmez. Açık iş, Dış operasyonlar
-- listesinin ölçütüdür: fason adım bitmemiş, emir iptal, bitmiş ya da arşivde değil. Kapanmış işin belgesi açılmaz.
INSERT INTO uretim_emirleri_dis_islem_emri (is_emri_id, acilis)
SELECT i.id, 'goc'
  FROM uretim_emirleri_is_emri i
  JOIN uretim_emri e ON e.id = i.uretim_emri_id
 WHERE i.fason_firma_id IS NOT NULL AND i.durum <> 'tamam' AND e.durum NOT IN ('iptal', 'bitti') AND NOT e.arsiv
 ORDER BY i.id
ON CONFLICT (is_emri_id) DO NOTHING;
