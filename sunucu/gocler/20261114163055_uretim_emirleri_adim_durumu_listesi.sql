-- Adım Durumu'ndan hazırlık listesi (3249 b): ofisten eklenen madde kimin ve ne zaman eklediğini, ofisten verilen işaret kaynağını
-- taşır; operatörün terminalde yaptığı işaret kaynaksızdır (Risk K4). Üçü de boş olabilen sütundur: var olan satırlar değişmez,
-- sütun eklemek satır tetiklerini (yalnız ekleme) çalıştırmaz.
ALTER TABLE emir_adimi
  ADD COLUMN ekleyen_id int REFERENCES kisi,
  ADD COLUMN eklenme timestamptz,
  ADD CONSTRAINT emir_adimi_ekleyen_butun CHECK ((ekleyen_id IS NULL) = (eklenme IS NULL));
CREATE INDEX emir_adimi_ekleyen_fk_idx ON emir_adimi (ekleyen_id) WHERE ekleyen_id IS NOT NULL;

ALTER TABLE emir_adimi_olayi
  ADD COLUMN kaynak text CONSTRAINT emir_adimi_olayi_kaynak_degeri CHECK (kaynak IS NULL OR kaynak = 'adim-durumu');
