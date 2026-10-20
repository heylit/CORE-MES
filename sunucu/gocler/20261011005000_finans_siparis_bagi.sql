-- Alış faturası satın alma siparişine bağlanabilir (kullanıcı kararı D6 b, 11.10.2026); bağı satın almanın ucu finansın komutuyla yazar.
-- Sütunlar boş olabilir; dolu belgeler değişmez. Sipariş anahtarı satın almada (talep, teklif) çiftidir.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM finans_belge;
  RAISE NOTICE 'finans_belge: % satır; göç yalnız boş olabilen iki sütun ekler', satir;
END $$;

ALTER TABLE finans_belge
  ADD COLUMN satin_alma_talep_id uuid,
  ADD COLUMN satin_alma_teklif_id uuid,
  ADD CONSTRAINT finans_belge_siparis_butun CHECK ((satin_alma_talep_id IS NULL) = (satin_alma_teklif_id IS NULL)),
  ADD CONSTRAINT finans_belge_siparis_alis CHECK (satin_alma_talep_id IS NULL OR yon = 'gider'),
  -- Talep silinince sipariş de silinir (satın almanın kendi kuralı); belge kalır, bağ boşalır.
  ADD CONSTRAINT finans_belge_siparis FOREIGN KEY (satin_alma_talep_id, satin_alma_teklif_id)
    REFERENCES satin_alma_siparis (talep_id, teklif_id) ON DELETE SET NULL;

CREATE INDEX finans_belge_siparis_dizini ON finans_belge (satin_alma_talep_id, satin_alma_teklif_id) WHERE satin_alma_talep_id IS NOT NULL;
