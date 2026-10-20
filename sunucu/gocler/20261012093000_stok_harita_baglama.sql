-- Raf, göz ve zemin alanı Fabrika Haritası'nda tek kaynaktır (kart #686, adım 1): stok konumu haritadaki göze ya da alana,
-- depo da bölüme bağlanır. Haritada silinen yerin bağı boşalır (stok konumu ve bakiyesi kalır); bağ adım 2'de konum yerine geçer.
ALTER TABLE stok_depo ADD COLUMN atolye_salon_id int
  CONSTRAINT stok_depo_atolye_salon_bagi REFERENCES atolye_salon ON DELETE SET NULL,
  ADD CONSTRAINT stok_depo_atolye_salon_tek UNIQUE (atolye_salon_id);

ALTER TABLE stok_konum ADD COLUMN atolye_goz_id int
  CONSTRAINT stok_konum_atolye_goz_bagi REFERENCES atolye_goz ON DELETE SET NULL,
  ADD COLUMN atolye_alan_id int
  CONSTRAINT stok_konum_atolye_alan_bagi REFERENCES atolye_alan ON DELETE SET NULL,
  ADD CONSTRAINT stok_konum_atolye_goz_tek UNIQUE (atolye_goz_id),
  ADD CONSTRAINT stok_konum_atolye_alan_tek UNIQUE (atolye_alan_id);

-- Haritada açılan göz stokta raf satırı olmadan konumdur; göz haritada silinince bağı boşalır, bölme ve kat iz olarak kalır.
-- Alan yalnız raf gözü olmayan konuma, göz yalnız raf gözüne bağlanır.
ALTER TABLE stok_konum DROP CONSTRAINT stok_konum_tur_alanlari,
  ADD CONSTRAINT stok_konum_tur_alanlari CHECK (
    (tur = 'raf_gozu') = (bolme_no IS NOT NULL AND kat_no IS NOT NULL)
    AND (tur = 'raf_gozu' OR (raf_id IS NULL AND atolye_goz_id IS NULL))
  ),
  ADD CONSTRAINT stok_konum_alan_turu CHECK (atolye_alan_id IS NULL OR tur <> 'raf_gozu');

UPDATE stok_depo d SET atolye_salon_id = s.id FROM atolye_salon s WHERE s.stok_depo_id = d.id;
UPDATE stok_konum k SET atolye_goz_id = g.id FROM atolye_goz g WHERE g.stok_konum_id = k.id;
UPDATE stok_konum k SET atolye_alan_id = a.id FROM atolye_alan a WHERE a.stok_konum_id = k.id;
