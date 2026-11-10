-- 2721: başlamış emir arşive alınınca iptal olur ve başlama anı kalır (sayım, olay ve kapanış o ana bağlıdır). Kısıt yalnız genişler:
-- iptal emirde başlama boş da dolu da olabilir; var olan satırların hepsi yeni kısıta uyar.
ALTER TABLE uretim_emri
  DROP CONSTRAINT uretim_emri_durum_alanlari,
  ADD CONSTRAINT uretim_emri_durum_alanlari CHECK (
    CASE durum
      WHEN 'taslak' THEN baslama IS NULL AND bitis IS NULL AND iptal IS NULL AND saglam_adet IS NULL
      WHEN 'planli' THEN baslama IS NULL AND bitis IS NULL AND iptal IS NULL AND saglam_adet IS NULL
      WHEN 'basladi' THEN baslama IS NOT NULL AND bitis IS NULL AND iptal IS NULL AND saglam_adet IS NULL
      WHEN 'bitti' THEN baslama IS NOT NULL AND bitis IS NOT NULL AND iptal IS NULL AND saglam_adet IS NOT NULL
      ELSE bitis IS NULL AND iptal IS NOT NULL AND saglam_adet IS NULL
    END
  );
