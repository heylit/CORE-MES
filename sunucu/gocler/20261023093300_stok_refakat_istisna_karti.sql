-- İstisna kartı (Soru 129, 131 a): sayımın malzemesi hiçbir yerde yoksa sayım durmaz; eksik genel stoktan lotsuz eksi düşülür ve
-- emrin o malzemedeki lotsuz kartına yazılır. Depo sonra kartı gerçek lota bağlar: lotsuz düşüm geri alınır, o lottan yeniden düşülür.
-- stok_refakat_partisi dolu tablodur: satırlar değişmez; lot sütunu boş olabilir olur, bağlama sütunları boş eklenir. Düşüm bağı yeni tablodur.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM stok_refakat_partisi;
  RAISE NOTICE 'stok_refakat_istisna_karti: % refakat karti satiri degismez.', n;
END $$;

ALTER TABLE stok_refakat_partisi
  ALTER COLUMN parti_id DROP NOT NULL,
  ADD COLUMN lota_baglayan_kisi_id int REFERENCES kisi,
  ADD COLUMN lota_baglanma_zamani timestamptz,
  ADD CONSTRAINT stok_refakat_partisi_baglama_tutarli CHECK ((lota_baglayan_kisi_id IS NULL) = (lota_baglanma_zamani IS NULL)),
  ADD CONSTRAINT stok_refakat_partisi_bagli_lotlu CHECK (lota_baglanma_zamani IS NULL OR parti_id IS NOT NULL);
-- Emir ve malzeme başına tek açık lotsuz kart: bağlanana kadar o emrin o malzemedeki bütün lotsuz düşümleri aynı karta yazılır.
CREATE UNIQUE INDEX stok_refakat_partisi_istisna_tek ON stok_refakat_partisi (uretim_emri_id, malzeme_id)
  WHERE parti_id IS NULL AND durum = 'acik' AND birlestigi_refakat_partisi_id IS NULL;

-- Lotsuz düşüm ile kartın bağı. Bağlanınca düşümün geri alması ve lottan yeniden düşen hareket yazılır.
CREATE TABLE stok_refakat_istisna_dusumu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  refakat_partisi_id int NOT NULL REFERENCES stok_refakat_partisi,
  hareket_id bigint NOT NULL CONSTRAINT stok_refakat_istisna_dusumu_hareket_tek UNIQUE REFERENCES stok_hareketi,
  geri_alma_hareket_id bigint REFERENCES stok_hareketi,
  lot_hareket_id bigint REFERENCES stok_hareketi,
  CONSTRAINT stok_refakat_istisna_dusumu_baglama_tutarli CHECK ((geri_alma_hareket_id IS NULL) = (lot_hareket_id IS NULL))
);
CREATE INDEX stok_refakat_istisna_dusumu_kart_idx ON stok_refakat_istisna_dusumu (refakat_partisi_id);
