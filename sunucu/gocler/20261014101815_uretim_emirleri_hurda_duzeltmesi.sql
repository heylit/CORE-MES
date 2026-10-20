-- Hurda düzeltilebilir (kart #1194): terminaldeki hurda -1 emirde eksi adetli düzeltme satırıdır; artan hurda düzeltme değildir. Toplamın sıfırın altına inmemesini servis denetler.
ALTER TABLE uretim_sayimi DROP CONSTRAINT uretim_sayimi_hurda_artar;
ALTER TABLE uretim_sayimi DROP CONSTRAINT uretim_sayimi_hurda_duzeltme_degil;
ALTER TABLE uretim_sayimi ADD CONSTRAINT uretim_sayimi_hurda_duzeltmesi_eksidir CHECK (tur <> 'hurda' OR (adet < 0) = duzeltme);
