-- Talimat adımına "Bitince" aşaması (3338-4 a): iş bittikten sonra yapılacaklar (temizlik, söküm, son kayıt). Yalnız izin verilen
-- değer listesi genişler; var olan satırlar değişmez. Kısıt değiştirmek satır tetiğini (yalnız ekleme) çalıştırmaz.
ALTER TABLE rota_talimat_adimi DROP CONSTRAINT rota_talimat_adimi_asama_gecerli,
  ADD CONSTRAINT rota_talimat_adimi_asama_gecerli CHECK (asama IN ('on_hazirlik', 'hazirlik', 'uretim', 'bitis'));
ALTER TABLE rota_talimat_sablon_adimi DROP CONSTRAINT rota_talimat_sablon_adimi_asama_gecerli,
  ADD CONSTRAINT rota_talimat_sablon_adimi_asama_gecerli CHECK (asama IN ('on_hazirlik', 'hazirlik', 'uretim', 'bitis'));
ALTER TABLE rota_talimat_taslak_adimi DROP CONSTRAINT rota_talimat_taslak_adimi_asama_gecerli,
  ADD CONSTRAINT rota_talimat_taslak_adimi_asama_gecerli CHECK (asama IN ('on_hazirlik', 'hazirlik', 'uretim', 'bitis'));
