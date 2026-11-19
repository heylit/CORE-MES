-- 3429-3 F4: emirsiz satış kalemi ("Stoktan", "Satın al") sevkiyatın Tüm işlerine sipariş kalemi olarak düşer. Dolu tablo
-- sevkiyat_bekleyen'e boş olabilen sütun eklenir, kaynak CHECK'leri genişler; var olan satır değişmez, silinmez (hepsi eski koşulları sağlar).
-- Yabancı anahtar yok: modüller arası bağ Aşama 2'de ayrı göçle (F2'deki stok_ayirma_istegi.siparis_satiri_id gibi).
ALTER TABLE sevkiyat_bekleyen
  ADD COLUMN satis_siparis_satiri_id int,
  DROP CONSTRAINT sevkiyat_bekleyen_kaynak,
  ADD CONSTRAINT sevkiyat_bekleyen_kaynak CHECK (kaynak IN ('urun', 'fason', 'fason-donus', 'alim', 'elle', 'siparis')),
  DROP CONSTRAINT sevkiyat_bekleyen_kaynak_alanlari,
  ADD CONSTRAINT sevkiyat_bekleyen_kaynak_alanlari CHECK (
    (kaynak = 'urun' AND uretim_emri_id IS NOT NULL AND fason_hareket_id IS NULL AND talep_id IS NULL)
    OR (kaynak = 'fason' AND uretim_emri_id IS NOT NULL AND (fason_hareket_id IS NOT NULL OR is_emri_id IS NOT NULL) AND talep_id IS NULL AND firma_id IS NOT NULL)
    OR (kaynak = 'fason-donus' AND uretim_emri_id IS NOT NULL AND is_emri_id IS NOT NULL AND gidis_bekleyen_id IS NOT NULL AND fason_hareket_id IS NULL AND talep_id IS NULL AND firma_id IS NOT NULL)
    OR (kaynak = 'alim' AND talep_id IS NOT NULL AND uretim_emri_id IS NULL AND fason_hareket_id IS NULL)
    OR (kaynak = 'elle' AND firma_id IS NOT NULL AND aciklama IS NOT NULL AND uretim_emri_id IS NULL AND fason_hareket_id IS NULL AND talep_id IS NULL)
    OR (kaynak = 'siparis' AND satis_siparis_satiri_id IS NOT NULL AND firma_id IS NOT NULL AND malzeme_no IS NOT NULL AND adet IS NOT NULL
      AND uretim_emri_id IS NULL AND fason_hareket_id IS NULL AND talep_id IS NULL)
  ),
  DROP CONSTRAINT sevkiyat_bekleyen_yon_kaynagi,
  ADD CONSTRAINT sevkiyat_bekleyen_yon_kaynagi CHECK (kaynak = 'elle' OR yon = CASE WHEN kaynak IN ('urun', 'fason', 'siparis') THEN 'gidis' ELSE 'gelis' END),
  ADD CONSTRAINT sevkiyat_bekleyen_satis_siparisinde CHECK (satis_siparis_satiri_id IS NULL OR kaynak = 'siparis');

CREATE INDEX sevkiyat_bekleyen_satis_siparis_satiri_dizini ON sevkiyat_bekleyen (satis_siparis_satiri_id) WHERE satis_siparis_satiri_id IS NOT NULL;
