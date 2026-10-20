-- Malzeme · Teslim (kart #1208): bütün sayfalardan malzeme isteği ve iki adımlı teslim. Var olan satırlar değişmez, silinmez.
-- İstek istasyonsuz da açılır (ofisteki kişi; teslim isteyen kişiye); stokta yetmeyen istek "stok_yok" durumunda açılır.
-- İstasyon stok konumudur: konum istasyondan kendiliğinden doğar (elle açılmaz), harita ve stok aynı istasyonu görür.
-- Teslim, gönderenle alan arasındaki kayıttır; stok hareketi (transfer) teslim alınınca yazılır.
DO $$
DECLARE istek bigint; konum bigint;
BEGIN
  SELECT count(*) INTO istek FROM stok_malzeme_istegi;
  SELECT count(*) INTO konum FROM stok_konum;
  RAISE NOTICE 'stok_malzeme_teslim: % malzeme istegi ve % konum satiri degismez.', istek, konum;
END $$;

ALTER TABLE stok_malzeme_istegi
  ALTER COLUMN istasyon_id DROP NOT NULL,
  DROP CONSTRAINT stok_malzeme_istegi_durum_degeri,
  ADD CONSTRAINT stok_malzeme_istegi_durum_degeri CHECK (durum IN ('acik', 'stok_yok', 'hazirlaniyor', 'teslim', 'iptal'));

ALTER TABLE stok_konum
  ADD COLUMN istasyon_id int CONSTRAINT stok_konum_istasyon_var REFERENCES istasyon,
  ADD CONSTRAINT stok_konum_istasyon_tek UNIQUE (istasyon_id),
  DROP CONSTRAINT stok_konum_tur_degeri,
  ADD CONSTRAINT stok_konum_tur_degeri CHECK (tur IN ('raf_gozu', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'istasyon')),
  ADD CONSTRAINT stok_konum_istasyon_turu CHECK ((tur = 'istasyon') = (istasyon_id IS NOT NULL));

CREATE TABLE stok_teslim (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text NOT NULL,
  -- Gönderenin tekrar korumasıdır: aynı kimlikle ikinci gönderim yeni teslim açmaz.
  kaynak_kimligi text NOT NULL CONSTRAINT stok_teslim_kaynak_bicimi CHECK (btrim(kaynak_kimligi) = kaynak_kimligi AND length(kaynak_kimligi) BETWEEN 3 AND 120),
  malzeme_id integer NOT NULL CONSTRAINT stok_teslim_malzeme_var REFERENCES malzeme_katalog_karti (no),
  miktar numeric(14,3) NOT NULL CONSTRAINT stok_teslim_miktar_pozitif CHECK (miktar > 0),
  parti_id bigint,
  -- Statü üretimde değişir; teslim parçayı olduğu statüyle taşır (boş: serbest).
  statu_id int CONSTRAINT stok_teslim_statu_var REFERENCES recete_rota_statu (id),
  kaynak_konum_id int NOT NULL CONSTRAINT stok_teslim_kaynak_var REFERENCES stok_konum,
  hedef_konum_id int NOT NULL CONSTRAINT stok_teslim_hedef_var REFERENCES stok_konum,
  uretim_emri_id int, -- Aşama 2: yabancı anahtar ayrı göçle (STK6 b)
  istek_id int CONSTRAINT stok_teslim_istek_var REFERENCES stok_malzeme_istegi,
  aciklama text CONSTRAINT stok_teslim_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 200)),
  durum text NOT NULL DEFAULT 'yolda' CONSTRAINT stok_teslim_durum_degeri CHECK (durum IN ('yolda', 'teslim', 'red', 'iptal')),
  -- Alan taraf aldığı miktarı yazar; teslimden önce bilinmez (sıfır uydurulmaz).
  alinan numeric(14,3) CONSTRAINT stok_teslim_alinan_pozitif CHECK (alinan > 0),
  red_nedeni text CONSTRAINT stok_teslim_red_bicimi CHECK (red_nedeni IS NULL OR (btrim(red_nedeni) <> '' AND length(red_nedeni) <= 200)),
  hareket_id bigint CONSTRAINT stok_teslim_hareket_var REFERENCES stok_hareketi,
  gonderen_kisi_id int NOT NULL REFERENCES kisi,
  kapatan_kisi_id int REFERENCES kisi,
  gonderim timestamptz NOT NULL DEFAULT now(),
  kapanis timestamptz,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_teslim_no_tek UNIQUE (no),
  CONSTRAINT stok_teslim_kaynak_tek UNIQUE (kaynak_kimligi),
  CONSTRAINT stok_teslim_yon CHECK (kaynak_konum_id <> hedef_konum_id),
  CONSTRAINT stok_teslim_parti_malzemesi FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id),
  CONSTRAINT stok_teslim_alinan_tutarli CHECK ((durum = 'teslim') = (alinan IS NOT NULL AND hareket_id IS NOT NULL)),
  CONSTRAINT stok_teslim_red_tutarli CHECK ((durum = 'red') = (red_nedeni IS NOT NULL)),
  CONSTRAINT stok_teslim_kapanis_tutarli CHECK ((durum = 'yolda') = (kapatan_kisi_id IS NULL AND kapanis IS NULL))
);
CREATE INDEX stok_teslim_gonderim_idx ON stok_teslim (gonderim, id);
CREATE INDEX stok_teslim_yolda_hedef_idx ON stok_teslim (hedef_konum_id) WHERE durum = 'yolda';
CREATE INDEX stok_teslim_istek_idx ON stok_teslim (istek_id) WHERE istek_id IS NOT NULL;
