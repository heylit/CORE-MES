-- Sayım hangi refakat partisinin (emir + hammadde lotu) parçasını saydığını taşır (kart #125). Boş: kartsız sayım ya da eski satır.
-- Parti stokundur; yabancı anahtar Aşama 2'de ayrı göçle gelir, partinin geçerliliğini sayım olayını dinleyen stok denetler.
ALTER TABLE uretim_sayimi ADD COLUMN refakat_partisi_id int CONSTRAINT uretim_sayimi_refakat_partisi_pozitif CHECK (refakat_partisi_id > 0);
