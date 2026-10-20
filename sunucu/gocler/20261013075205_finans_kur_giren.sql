-- Kur düzeltmesi de "son giren" olarak görünsün: düzelten kişi ve zamanı. İlk girişte boştur (giren olusturan_id'dir).
ALTER TABLE finans_kur
  ADD COLUMN guncelleyen_id int REFERENCES kisi (id),
  ADD COLUMN guncelleme timestamptz,
  ADD CONSTRAINT finans_kur_guncelleme_cifti CHECK ((guncelleyen_id IS NULL) = (guncelleme IS NULL));
