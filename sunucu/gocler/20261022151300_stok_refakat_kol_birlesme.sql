-- Kol ve birleşme (kart #126): bölünmüş partinin (kol) kartı üst emrin kartından açılır ve aynı lotu taşır; kol üste ya da kardeşine
-- birleşince kartı hedef kartı gösterir, eski kart okutulunca hedefe gider. Var olan satırlar değişmez; yalnız boş sütunlar ve kısıtlar.
ALTER TABLE stok_refakat_partisi
  ADD COLUMN ust_refakat_partisi_id int REFERENCES stok_refakat_partisi,
  ADD COLUMN birlestigi_refakat_partisi_id int REFERENCES stok_refakat_partisi,
  ADD COLUMN birlesme_zamani timestamptz,
  ADD CONSTRAINT stok_refakat_partisi_birlesme_tutarli CHECK ((birlestigi_refakat_partisi_id IS NULL) = (birlesme_zamani IS NULL)),
  ADD CONSTRAINT stok_refakat_partisi_kendine_bagli_degil CHECK (ust_refakat_partisi_id <> id AND birlestigi_refakat_partisi_id <> id);
CREATE INDEX stok_refakat_partisi_ust_idx ON stok_refakat_partisi (ust_refakat_partisi_id) WHERE ust_refakat_partisi_id IS NOT NULL;
