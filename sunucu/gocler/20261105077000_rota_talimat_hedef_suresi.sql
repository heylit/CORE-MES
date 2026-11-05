-- Talimat adımının hedef süresi (2098-8 a): dakika, boş olabilir; operatöre gösterilmez, planlama geçen süreyle karşılaştırır.
-- NULL'a izinli eklenir: var olan adımlarda hedef yoktur (sıfır uydurulmaz), veri değişmez. Sütun eklemek satır tetiğini çalıştırmaz.
ALTER TABLE rota_talimat_adimi
  ADD COLUMN hedef_sure_dk integer CONSTRAINT rota_talimat_adimi_hedef_sure_gecerli CHECK (hedef_sure_dk BETWEEN 1 AND 1440);
ALTER TABLE rota_talimat_sablon_adimi
  ADD COLUMN hedef_sure_dk integer CONSTRAINT rota_talimat_sablon_adimi_hedef_sure_gecerli CHECK (hedef_sure_dk BETWEEN 1 AND 1440);
ALTER TABLE rota_talimat_taslak_adimi
  ADD COLUMN hedef_sure_dk integer CONSTRAINT rota_talimat_taslak_adimi_hedef_sure_gecerli CHECK (hedef_sure_dk BETWEEN 1 AND 1440);
