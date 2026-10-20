-- Fasondan dönüş (kart #206, K-080 c, UYUM-BORCU 24 ve 25): yarı mamul fason konumuna taşınır; dönüşte hizmet sipariş
-- satırının mal kabulü dönen kartı stoğa alır, fason konumundaki gideni düşer. Malzemesiz saf hizmet stok yazmaz, yalnız
-- satın almaya teslim verir: o satırda konum ve hareket boştur. Var olan satır değişmez; göç önce sayar ve söyler.
DO $$
DECLARE
  konum bigint;
  satir bigint;
BEGIN
  SELECT count(*) INTO konum FROM stok_konum;
  SELECT count(*) INTO satir FROM stok_mal_kabul_satiri;
  RAISE NOTICE 'stok_fason_donus: % konum ve % mal kabul satırı değişmez (yeni tür ve boş olabilen sütunlar).', konum, satir;
END $$;

ALTER TABLE stok_konum DROP CONSTRAINT stok_konum_tur_degeri;
ALTER TABLE stok_konum ADD CONSTRAINT stok_konum_tur_degeri CHECK (tur IN ('raf_gozu', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason'));

ALTER TABLE stok_mal_kabul_satiri ALTER COLUMN konum_id DROP NOT NULL;
ALTER TABLE stok_mal_kabul_satiri ALTER COLUMN hareket_id DROP NOT NULL;
-- Stok yazmayan satır yalnız saf hizmettir: sipariş satırına bağlıdır, partisi ve fason çıkışı yoktur.
ALTER TABLE stok_mal_kabul_satiri ADD CONSTRAINT stok_mal_kabul_satiri_stoksuz_hizmet CHECK (
  (konum_id IS NULL) = (hareket_id IS NULL)
  AND (hareket_id IS NOT NULL OR (siparis_satir_id IS NOT NULL AND parti_id IS NULL))
);
-- Fason dönüşünde fason konumundan düşülen giden yarı mamulün çıkış hareketi.
ALTER TABLE stok_mal_kabul_satiri
  ADD COLUMN fason_cikis_hareket_id bigint CONSTRAINT stok_mal_kabul_satiri_fason_cikis_var REFERENCES stok_hareketi (id),
  ADD CONSTRAINT stok_mal_kabul_satiri_fason_cikis_tek UNIQUE (fason_cikis_hareket_id),
  ADD CONSTRAINT stok_mal_kabul_satiri_fason_bagli CHECK (fason_cikis_hareket_id IS NULL OR (hareket_id IS NOT NULL AND siparis_satir_id IS NOT NULL));

-- Fason çıkışı da belgenin parçasıdır: yalnız Logo alanları değişir.
CREATE OR REPLACE FUNCTION stok_mal_kabul_satiri_logo_disi_sabit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stok_mal_kabul_satiri silinmez' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.mal_kabul_id, NEW.sira, NEW.malzeme_id, NEW.sayilan_miktar, NEW.parti_id, NEW.konum_id, NEW.hareket_id, NEW.siparis_satir_id, NEW.fason_cikis_hareket_id)
     IS DISTINCT FROM (OLD.mal_kabul_id, OLD.sira, OLD.malzeme_id, OLD.sayilan_miktar, OLD.parti_id, OLD.konum_id, OLD.hareket_id, OLD.siparis_satir_id, OLD.fason_cikis_hareket_id) THEN
    RAISE EXCEPTION 'stok_mal_kabul_satiri yalnız Logo alanlarında değişir' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
