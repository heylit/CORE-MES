-- Kalite durumu (134 a, Faz B): rota statüsünün yanında ikinci eksen; parçanın kullanılabilir olup olmadığını söyler. Kullanılabilir stok
-- serbest ya da şartlıdır; karar bekleyen ve red parça üretimde uyarıyla ilerler, rezerveye girmez (135). Var olan satırlar değişmez:
-- bakiye ve teslim serbest başlar, eski hareketlerde boş kalite serbesttir. Kalite yalnız hareketle değişir: aynı konumda kalite değişimi
-- transfer hareketidir (statüdeki gibi).
DO $$
DECLARE bakiye bigint; hareket bigint; teslim bigint;
BEGIN
  SELECT count(*) INTO bakiye FROM stok_bakiye;
  SELECT count(*) INTO hareket FROM stok_hareketi;
  SELECT count(*) INTO teslim FROM stok_teslim;
  RAISE NOTICE 'stok_kalite_durumu: % bakiye, % hareket ve % teslim satiri serbest kalir; veri degismez.', bakiye, hareket, teslim;
END $$;

ALTER TABLE stok_bakiye
  ADD COLUMN kalite_durumu text NOT NULL DEFAULT 'serbest'
    CONSTRAINT stok_bakiye_kalite_degeri CHECK (kalite_durumu IN ('serbest', 'karar_bekliyor', 'sartli', 'red')),
  DROP CONSTRAINT stok_bakiye_tek,
  ADD CONSTRAINT stok_bakiye_tek UNIQUE NULLS NOT DISTINCT (malzeme_id, konum_id, parti_id, statu_id, kalite_durumu);
CREATE INDEX stok_bakiye_kalite_idx ON stok_bakiye (kalite_durumu) WHERE kalite_durumu <> 'serbest';

ALTER TABLE stok_hareketi
  ADD COLUMN kaynak_kalite_durumu text
    CONSTRAINT stok_hareketi_kaynak_kalite_degeri CHECK (kaynak_kalite_durumu IN ('serbest', 'karar_bekliyor', 'sartli', 'red')),
  ADD COLUMN hedef_kalite_durumu text
    CONSTRAINT stok_hareketi_hedef_kalite_degeri CHECK (hedef_kalite_durumu IN ('serbest', 'karar_bekliyor', 'sartli', 'red')),
  ADD CONSTRAINT stok_hareketi_kalite_yonde CHECK ((kaynak_kalite_durumu IS NULL OR kaynak_konum_id IS NOT NULL) AND (hedef_kalite_durumu IS NULL OR hedef_konum_id IS NOT NULL)),
  DROP CONSTRAINT stok_hareketi_yon,
  ADD CONSTRAINT stok_hareketi_yon CHECK (
    CASE tur
      WHEN 'giris' THEN kaynak_konum_id IS NULL AND hedef_konum_id IS NOT NULL
      WHEN 'sayim_fazla' THEN kaynak_konum_id IS NULL AND hedef_konum_id IS NOT NULL
      WHEN 'cikis' THEN kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NULL
      WHEN 'sayim_eksik' THEN kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NULL
      WHEN 'transfer' THEN kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NOT NULL
        AND (kaynak_konum_id <> hedef_konum_id OR kaynak_statu_id IS DISTINCT FROM hedef_statu_id
          OR COALESCE(kaynak_kalite_durumu, 'serbest') <> COALESCE(hedef_kalite_durumu, 'serbest'))
      ELSE geri_alinan_id IS NOT NULL AND (kaynak_konum_id IS NOT NULL OR hedef_konum_id IS NOT NULL)
    END
  );

-- Teslim parçayı olduğu kalite durumuyla taşır.
ALTER TABLE stok_teslim
  ADD COLUMN kalite_durumu text NOT NULL DEFAULT 'serbest'
    CONSTRAINT stok_teslim_kalite_degeri CHECK (kalite_durumu IN ('serbest', 'karar_bekliyor', 'sartli', 'red'));
