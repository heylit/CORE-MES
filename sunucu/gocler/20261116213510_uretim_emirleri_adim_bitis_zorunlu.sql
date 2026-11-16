-- Emir adımında "Bitince" aşaması ve talimattan kopyalanan zorunluluk (3338-4 a): terminal zorunlu madde eksikken Başlat ve Bitir'de
-- uyarır. Değer listesi genişler; zorunlu NOT NULL DEFAULT false ile eklenir: var olan adımlar zorunlu değildir, veri değişmez.
-- Sütun eklemek satır tetiğini (emir_adimi_degismez) çalıştırmaz.
ALTER TABLE emir_adimi DROP CONSTRAINT emir_adimi_asama_gecerli,
  ADD CONSTRAINT emir_adimi_asama_gecerli CHECK (asama IN ('on_hazirlik', 'hazirlik', 'uretim', 'bitis')),
  ADD COLUMN zorunlu boolean NOT NULL DEFAULT false;
