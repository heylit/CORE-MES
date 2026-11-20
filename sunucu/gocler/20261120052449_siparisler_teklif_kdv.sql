-- 3461: teklif sürümü KDV oranını taşır; ekranda KDV dahil toplam, formda ve siparişe çevirmede varsayılan oran buradan gelir.
-- Önceki sürümlerde oran girilmemişti: boş kalır (uydurulmaz), o sürümlerin toplamı KDV hariç gösterilir.
ALTER TABLE siparisler_teklif_surumu ADD COLUMN kdv_orani numeric(5,2)
  CONSTRAINT siparisler_teklif_surumu_kdv CHECK (kdv_orani >= 0 AND kdv_orani <= 100);
