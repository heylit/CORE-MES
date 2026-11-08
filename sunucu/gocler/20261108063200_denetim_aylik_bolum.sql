-- Denetim kaydı ve değişiklik defteri aylık bölümlenir (1765 teyit): ikisi de yalnız eklenir ve zamanla sınırsız büyür.
-- Satırlar, kimlikler, dizinler, kişi bağı ve yalnız-ekleme tetikleri korunur; birincil anahtar (id, zaman) olur.
-- Bu iki tabloya gelen yabancı anahtar yoktur. Gelecek altı ayın bölümü açılır; sonrasını göç koşusu açar.
DO $$
DECLARE
  kayit bigint;
  degisiklik bigint;
BEGIN
  SELECT count(*) INTO kayit FROM denetim_kaydi;
  SELECT count(*) INTO degisiklik FROM denetim_degisiklik;
  RAISE NOTICE 'denetim_kaydi % satır, denetim_degisiklik % satır aylık bölümlere taşınıyor; satır değişmez', kayit, degisiklik;
END $$;

SELECT cekirdek_aylik_bolume_cevir('denetim_kaydi', 'zaman', 6);
SELECT cekirdek_aylik_bolume_cevir('denetim_degisiklik', 'zaman', 6);
