-- 3416-1 a: bekletmeye mühendislik ve teslim edilmedi nedenleri eklenir. Kısıt yalnız genişler; var olan satırlar değişmez.
ALTER TABLE uretim_emirleri_bekletme DROP CONSTRAINT uretim_emirleri_bekletme_neden;
ALTER TABLE uretim_emirleri_bekletme ADD CONSTRAINT uretim_emirleri_bekletme_neden
  CHECK (neden IN ('malzeme', 'musteri', 'fason', 'kalite', 'takim', 'muhendislik', 'teslim', 'diger'));
