-- Herkese sepet (Soru 133, 135): sepet satırı kartını ve hedefini taşır; Teslim et satırı hedefine kartla yolda gönderir.
-- stok_sepet_satiri dolu tablodur (Soru 135 onaylı): iki boş olabilen sütun eklenir, satırlar değişmez. Hedef istasyonun konumudur ya da stok konumu.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM stok_sepet_satiri;
  RAISE NOTICE 'stok_sepet_kart_hedef: % sepet satiri degismez.', n;
END $$;

ALTER TABLE stok_sepet_satiri
  ADD COLUMN refakat_partisi_id int REFERENCES stok_refakat_partisi,
  ADD COLUMN hedef_konum_id int REFERENCES stok_konum,
  ADD CONSTRAINT stok_sepet_satiri_kart_lotlu CHECK (refakat_partisi_id IS NULL OR parti_id IS NOT NULL);
