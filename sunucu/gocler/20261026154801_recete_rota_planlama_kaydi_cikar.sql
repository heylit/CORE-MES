-- Planlama çalışması plan modülüne geçti (658 b, 662 a): `:planlama` anahtarlı satırlar plan_planlama_kaydi'na aynen kopyalandı (önceki
-- göç). Burada kopyanın sayısı ve sürümleri yeniden denetlenir, eşitse eski satırlar silinir ve tablo bu anahtarları bir daha kabul etmez.
-- Eski satırların geçmişi recete_rota_kayit_gecmisi'nde kalır: o tablo yalnız eklenir, silinemez (kopyası planın geçmişindedir).
DO $$
DECLARE eksik bigint;
BEGIN
  SELECT count(*) INTO eksik
    FROM recete_rota_kayit r
    LEFT JOIN plan_planlama_kaydi p ON p.anahtar = r.anahtar AND p.surum = r.surum AND p.bicim = r.bicim AND p.deger = r.deger
   WHERE r.anahtar ~ '^recete-rota-motoru-v1:planlama([-:]|$)' AND p.anahtar IS NULL;
  IF eksik > 0 THEN
    RAISE EXCEPTION 'planlama kaydının % satırı planda aynı değil; Reçete ve Rota satırları silinmedi', eksik;
  END IF;
END $$;

DELETE FROM recete_rota_kayit WHERE anahtar ~ '^recete-rota-motoru-v1:planlama([-:]|$)';

ALTER TABLE recete_rota_kayit
  ADD CONSTRAINT recete_rota_kayit_planlama_yok CHECK (anahtar !~ '^recete-rota-motoru-v1:planlama([-:]|$)');
