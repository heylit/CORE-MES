-- SmartES'in kesin reddettiği iş emri kendiliğinden yeniden denenmez: "durdu" = durum hata ve sonraki deneme boş.
-- Denenen özet, duran iş emri değişince kendiliğinden yeniden gitsin diye saklanır. Yalnız ekleme ve kısıt gevşetme: satır değişmez.
ALTER TABLE smartes_giden DROP CONSTRAINT smartes_giden_butun;
ALTER TABLE smartes_giden ADD CONSTRAINT smartes_giden_butun CHECK ((son_hata IS NOT NULL) = (durum = 'hata'));
ALTER TABLE smartes_giden ADD COLUMN denenen_ozet text;
