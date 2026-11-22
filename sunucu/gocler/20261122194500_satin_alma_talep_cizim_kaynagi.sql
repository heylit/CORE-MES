-- 3571: talep çiziminin kaynağı (Çizim Merkezi revizyonu, Ortak Dosyalar sürümü, birleşen kaynak talep) ve satın almanın kaldırdığı
-- talep çiziminin notu. Yeni tablolar; var olan veri değişmez. Satırı olmayan çizim "Yüklendi"dir. Belge ve dosya kimlikleri başka
-- modülün kaydıdır, yabancı anahtar yoktur: kaynak sonra kalıcı silinse de talepteki çizim kalır (Risk K3).
CREATE TABLE satin_alma_talep_cizim_kaynagi (
  talep_id uuid NOT NULL CONSTRAINT satin_alma_talep_cizim_kaynagi_talep REFERENCES satin_alma_talep ON DELETE CASCADE,
  ozet text NOT NULL,
  kaynak_tur text NOT NULL CONSTRAINT satin_alma_talep_cizim_kaynagi_tur CHECK (kaynak_tur IN ('yuklendi', 'cizim-merkezi', 'ortak-dosyalar')),
  belge_id int,
  revizyon_id int,
  dosya_id int,
  surum_sirasi int,
  klasor_yolu text[],
  kaynak_talep_id uuid CONSTRAINT satin_alma_talep_cizim_kaynagi_kaynak_talep REFERENCES satin_alma_talep ON DELETE SET NULL,
  ekleyen_id int NOT NULL CONSTRAINT satin_alma_talep_cizim_kaynagi_ekleyen REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (talep_id, ozet),
  CONSTRAINT satin_alma_talep_cizim_kaynagi_butun CHECK (
    (kaynak_tur = 'cizim-merkezi' AND belge_id IS NOT NULL AND revizyon_id IS NOT NULL AND dosya_id IS NULL AND surum_sirasi IS NULL AND klasor_yolu IS NULL)
    OR (kaynak_tur = 'ortak-dosyalar' AND dosya_id IS NOT NULL AND surum_sirasi IS NOT NULL AND belge_id IS NULL AND revizyon_id IS NULL)
    OR (kaynak_tur = 'yuklendi' AND kaynak_talep_id IS NOT NULL AND belge_id IS NULL AND revizyon_id IS NULL AND dosya_id IS NULL AND surum_sirasi IS NULL AND klasor_yolu IS NULL)
  )
);
CREATE INDEX satin_alma_talep_cizim_kaynagi_kaynak_dizini ON satin_alma_talep_cizim_kaynagi (kaynak_talep_id) WHERE kaynak_talep_id IS NOT NULL;

CREATE TABLE satin_alma_talep_cizim_kaldirma (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  talep_id uuid NOT NULL CONSTRAINT satin_alma_talep_cizim_kaldirma_talep REFERENCES satin_alma_talep ON DELETE CASCADE,
  ad text NOT NULL CONSTRAINT satin_alma_talep_cizim_kaldirma_ad CHECK (btrim(ad) <> '' AND length(ad) <= 200),
  kaldiran_id int NOT NULL CONSTRAINT satin_alma_talep_cizim_kaldirma_kaldiran REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX satin_alma_talep_cizim_kaldirma_talep_dizini ON satin_alma_talep_cizim_kaldirma (talep_id);
