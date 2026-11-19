-- 3437-3b-3b (Risk N1): iptal edilen alt kart ailedeki etiketini bırakır; kartı iptal edilen alternatif aynı nitelikle yeniden açılabilir.
-- Yalnız dizin yeniden kurulur, veri değişmez; iptal edilmemiş kartlarda kural aynıdır.
DROP INDEX malzeme_katalog_karti_alt_etiket_tek;
CREATE UNIQUE INDEX malzeme_katalog_karti_alt_etiket_tek ON malzeme_katalog_karti (ana_kart_no, alt_etiket)
  WHERE ana_kart_no IS NOT NULL AND onay_durumu <> 'iptal';
