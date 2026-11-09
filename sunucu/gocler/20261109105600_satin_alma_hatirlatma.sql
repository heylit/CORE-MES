-- 2432: satın alma hatırlatmaları. Bekleme süreli hatırlatma (taslakta, değerlendirmede, onayda bekleyen talep) durumun ne zamandan
-- beri sürdüğünü ister; talepte bu zaman yoktu. Var olan talepler son güncellemeden sayılır (2432 V4 a); veri silinmez, dönüşmez.
ALTER TABLE satin_alma_talep ADD COLUMN durum_zamani timestamptz;
UPDATE satin_alma_talep SET durum_zamani = guncelleme;
ALTER TABLE satin_alma_talep ALTER COLUMN durum_zamani SET DEFAULT now();
ALTER TABLE satin_alma_talep ALTER COLUMN durum_zamani SET NOT NULL;

-- Bildirim tekrarı yalnız okunmamışken engellenir; periyodik iş okunan hatırlatmayı yeniden açmasın diye açılan her hatırlatma
-- burada tutulur. Anahtar türü ve dönemi taşır (ör. ihtiyaç tarihi): tarih değişince eski kapanır, yeni koşul yeni anahtar açar.
-- Talep silinirse (yalnız taslak silinir) satır kalır, iş açık bildirimi kapatır.
CREATE TABLE satin_alma_hatirlatma (
  anahtar text PRIMARY KEY CONSTRAINT satin_alma_hatirlatma_anahtar CHECK (length(anahtar) BETWEEN 1 AND 300 AND anahtar LIKE tur || ':%'),
  tur text NOT NULL CONSTRAINT satin_alma_hatirlatma_tur CHECK (tur ~ '^satin-alma\.hatirlatma-[a-z]+(-[a-z]+)*$'),
  talep_id uuid CONSTRAINT satin_alma_hatirlatma_talep REFERENCES satin_alma_talep ON DELETE SET NULL,
  acildi timestamptz NOT NULL DEFAULT now(),
  kapandi timestamptz,
  CONSTRAINT satin_alma_hatirlatma_sira CHECK (kapandi IS NULL OR kapandi >= acildi)
);
CREATE INDEX satin_alma_hatirlatma_talep_dizini ON satin_alma_hatirlatma (talep_id);
CREATE INDEX satin_alma_hatirlatma_acik ON satin_alma_hatirlatma (tur) WHERE kapandi IS NULL;
