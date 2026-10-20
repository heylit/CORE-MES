-- Statülü stok (kart #1108): bakiye ve hareket Reçete ve Rota'nın statü tanımına yalnız yabancı anahtarla bağlanır; boş statü serbest
-- stoktur (sahte "Serbest" satırı açılmaz). Var olan satırlar değişmez, hepsi serbest kalır. Statü yalnız hareketle değişir (STK-S1):
-- aynı konumda statü değişimi transfer hareketidir.
DO $$
DECLARE bakiye bigint; hareket bigint;
BEGIN
  SELECT count(*) INTO bakiye FROM stok_bakiye;
  SELECT count(*) INTO hareket FROM stok_hareketi;
  RAISE NOTICE 'stok_statu: % bakiye ve % hareket satiri serbest (statu bos) kalir; veri degismez.', bakiye, hareket;
END $$;

ALTER TABLE stok_bakiye
  ADD COLUMN statu_id int CONSTRAINT stok_bakiye_statu_var REFERENCES recete_rota_statu (id),
  DROP CONSTRAINT stok_bakiye_tek,
  ADD CONSTRAINT stok_bakiye_tek UNIQUE NULLS NOT DISTINCT (malzeme_id, konum_id, parti_id, statu_id);
CREATE INDEX stok_bakiye_statu_idx ON stok_bakiye (statu_id) WHERE statu_id IS NOT NULL;

ALTER TABLE stok_hareketi
  ADD COLUMN kaynak_statu_id int CONSTRAINT stok_hareketi_kaynak_statu_var REFERENCES recete_rota_statu (id),
  ADD COLUMN hedef_statu_id int CONSTRAINT stok_hareketi_hedef_statu_var REFERENCES recete_rota_statu (id),
  ADD CONSTRAINT stok_hareketi_statu_yonde CHECK ((kaynak_statu_id IS NULL OR kaynak_konum_id IS NOT NULL) AND (hedef_statu_id IS NULL OR hedef_konum_id IS NOT NULL)),
  DROP CONSTRAINT stok_hareketi_yon,
  ADD CONSTRAINT stok_hareketi_yon CHECK (
    CASE tur
      WHEN 'giris' THEN kaynak_konum_id IS NULL AND hedef_konum_id IS NOT NULL
      WHEN 'sayim_fazla' THEN kaynak_konum_id IS NULL AND hedef_konum_id IS NOT NULL
      WHEN 'cikis' THEN kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NULL
      WHEN 'sayim_eksik' THEN kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NULL
      WHEN 'transfer' THEN kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NOT NULL
        AND (kaynak_konum_id <> hedef_konum_id OR kaynak_statu_id IS DISTINCT FROM hedef_statu_id)
      ELSE geri_alinan_id IS NOT NULL AND (kaynak_konum_id IS NOT NULL OR hedef_konum_id IS NOT NULL)
    END
  );
