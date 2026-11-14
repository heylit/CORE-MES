-- 3244 b: siparişten açılan projenin bitişi siparişin terminine bağlı olabilir; bağlı projede termin kayınca bitiş de kayar.
-- Elle değiştirilen bitiş bağı koparır, "Bağla" geri bağlar. Varsayılanlı sütun: var olan projeler bağsız kalır, davranış değişmez.
ALTER TABLE projeler_proje ADD COLUMN bitis_bagli boolean NOT NULL DEFAULT false;
