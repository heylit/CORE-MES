-- 3360-2 a: Logo'ya elle girilmiş belge CORE belgesine elle bağlanır; CORE onu bir daha göndermez. Kim ve ne zaman bağladığı giden satırındadır.
ALTER TABLE logo_giden
  ADD COLUMN elle_baglandi timestamptz,
  ADD COLUMN elle_baglayan int CONSTRAINT logo_giden_elle_baglayan REFERENCES kisi,
  ADD CONSTRAINT logo_giden_elle_bag CHECK (
    (elle_baglandi IS NULL) = (elle_baglayan IS NULL)
    AND (elle_baglandi IS NULL OR (son_sonuc = 'zaten-vardi' AND logo_kayit_no IS NOT NULL AND islem = 'gonder'))
  );
