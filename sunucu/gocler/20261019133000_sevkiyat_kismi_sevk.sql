-- 261 a: ürün yükü kısmi sevk için bölünür ve sevk anındaki müşteri satırda kalır; eski satırlarda yeni alanlar boş kalır, satır silinmez.

-- Bölünen parça, emrin ilk (kök) kaydını gösterir; emir başına tek kalan kök kayıttır.
ALTER TABLE sevkiyat_bekleyen ADD COLUMN ust_bekleyen_id int CONSTRAINT sevkiyat_bekleyen_ust REFERENCES sevkiyat_bekleyen (id),
  ADD CONSTRAINT sevkiyat_bekleyen_bolme_urunde CHECK (ust_bekleyen_id IS NULL OR kaynak = 'urun');
DROP INDEX sevkiyat_bekleyen_urun_tek;
CREATE UNIQUE INDEX sevkiyat_bekleyen_urun_tek ON sevkiyat_bekleyen (uretim_emri_id) WHERE kaynak = 'urun' AND ust_bekleyen_id IS NULL;

-- Üründe firma iş yola çıkınca ya da teslim edilince bırakış noktasından yazılır (sevk anının müşterisi); öncesinde boştur.
ALTER TABLE sevkiyat_bekleyen DROP CONSTRAINT sevkiyat_bekleyen_kaynak_alanlari,
  ADD CONSTRAINT sevkiyat_bekleyen_kaynak_alanlari CHECK (
    (kaynak = 'urun' AND uretim_emri_id IS NOT NULL AND fason_hareket_id IS NULL AND talep_id IS NULL)
    OR (kaynak = 'fason' AND uretim_emri_id IS NOT NULL AND fason_hareket_id IS NOT NULL AND talep_id IS NULL AND firma_id IS NOT NULL)
    OR (kaynak = 'alim' AND talep_id IS NOT NULL AND uretim_emri_id IS NULL AND fason_hareket_id IS NULL)
  );

