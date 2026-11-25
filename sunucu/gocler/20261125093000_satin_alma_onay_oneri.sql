-- 3696: onaylayan kararı değiştirmez, oneriyle geri gönderir; öneri (kalem -> teklif ve gerekçe) reddeden onay kaydında durur. Yalnız ekleme: var olan satırlar NULL kalır, veri değişmez.
ALTER TABLE satin_alma_onay ADD COLUMN oneri jsonb;
ALTER TABLE satin_alma_onay ADD CONSTRAINT satin_alma_onay_oneri_ret CHECK (oneri IS NULL OR sonuc = 'ret');
ALTER TABLE satin_alma_onay ADD CONSTRAINT satin_alma_onay_oneri_sekli CHECK (
  oneri IS NULL OR (jsonb_typeof(oneri) = 'object' AND jsonb_typeof(oneri -> 'atama') = 'array' AND jsonb_typeof(oneri -> 'gerekce') = 'string')
);
