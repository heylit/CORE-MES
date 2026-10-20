-- Aşama 2 tedarik akışı (kart #206, ST1 a, ST4 a): mal kabul satırı satın almanın sipariş satırına bağlanır (teslim bilgisi
-- satın almaya bu bağla yazılır); toplamayı kapatan kişi tutulur (başkasının listesini kapatan kayıtta görünür).
-- Var olan satır değişmez: iki sütun da boş olabilir. Bu göçten önce kapanmış listenin kapatanı bilinmez, boş kalır.
DO $$
DECLARE
  satir bigint;
  kapali bigint;
BEGIN
  SELECT count(*) INTO satir FROM stok_mal_kabul_satiri;
  SELECT count(*) INTO kapali FROM stok_toplama WHERE durum <> 'topluyor';
  RAISE NOTICE 'stok_tedarik_bagi: % mal kabul satırı sipariş bağsız kalır; % kapalı toplamanın kapatanı boş kalır (satır değişmez).', satir, kapali;
END $$;

ALTER TABLE stok_mal_kabul_satiri
  ADD COLUMN siparis_satir_id integer CONSTRAINT stok_mal_kabul_satiri_siparis_satiri_var REFERENCES satin_alma_siparis_satiri (id);
CREATE INDEX stok_mal_kabul_satiri_siparis_idx ON stok_mal_kabul_satiri (siparis_satir_id) WHERE siparis_satir_id IS NOT NULL;

-- Sipariş bağı da belgenin parçasıdır: yalnız Logo alanları değişir.
CREATE OR REPLACE FUNCTION stok_mal_kabul_satiri_logo_disi_sabit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stok_mal_kabul_satiri silinmez' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.mal_kabul_id, NEW.sira, NEW.malzeme_id, NEW.sayilan_miktar, NEW.parti_id, NEW.konum_id, NEW.hareket_id, NEW.siparis_satir_id)
     IS DISTINCT FROM (OLD.mal_kabul_id, OLD.sira, OLD.malzeme_id, OLD.sayilan_miktar, OLD.parti_id, OLD.konum_id, OLD.hareket_id, OLD.siparis_satir_id) THEN
    RAISE EXCEPTION 'stok_mal_kabul_satiri yalnız Logo alanlarında değişir' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE stok_toplama ADD COLUMN kapatan_kisi_id int CONSTRAINT stok_toplama_kapatan_var REFERENCES kisi;
ALTER TABLE stok_toplama ADD CONSTRAINT stok_toplama_kapatan_kapaliysa CHECK (kapatan_kisi_id IS NULL OR durum <> 'topluyor');
