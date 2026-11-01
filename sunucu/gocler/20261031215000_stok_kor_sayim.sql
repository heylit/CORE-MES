-- Kör sayım ve sayım farkı onayı (1279 a, 1691 teyit). Sayan kişi sistem miktarını görmeden sayar; fark deponun eşiğini aşarsa stoğa
-- yazılmaz, ikinci yetkili (stok.sayim-onayla, sayandan başka kişi) onaylayana kadar bekler. Eşik yüzdedir; varsayılan 0: her fark onay
-- ister. Var olan depo satırları 0 eşikle kalır; başka veri değişmez.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM stok_depo;
  RAISE NOTICE 'stok_kor_sayim: % depo satirina sayim_esik_yuzde = 0 eklenir; baska satir degismez.', n;
END $$;
ALTER TABLE stok_depo ADD COLUMN sayim_esik_yuzde numeric(5,2) NOT NULL DEFAULT 0
  CONSTRAINT stok_depo_sayim_esigi CHECK (sayim_esik_yuzde BETWEEN 0 AND 100);

-- Onay bekleyen sayım farkı. Onayda stoğa yazılan, sayımdaki fark (sayılan - sistem) kadardır: sayım ile onay arasındaki hareketler
-- korunur. Aynı göz, malzeme ve partide bekleyen tek fark olur.
CREATE TABLE stok_sayim_farki (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  konum_id int NOT NULL REFERENCES stok_konum,
  malzeme_id integer NOT NULL CONSTRAINT stok_sayim_farki_malzeme_var REFERENCES malzeme_katalog_karti (no),
  parti_id bigint,
  sistem_miktar numeric(14,3) NOT NULL,
  sayilan_miktar numeric(14,3) NOT NULL CONSTRAINT stok_sayim_farki_sayilan_eksi_degil CHECK (sayilan_miktar >= 0),
  sayan_kisi_id int NOT NULL REFERENCES kisi,
  sayim_zamani timestamptz NOT NULL DEFAULT now(),
  durum text NOT NULL DEFAULT 'bekliyor' CONSTRAINT stok_sayim_farki_durum_degeri CHECK (durum IN ('bekliyor', 'onaylandi', 'reddedildi')),
  karar_kisi_id int REFERENCES kisi,
  karar_zamani timestamptz,
  karar_notu text CONSTRAINT stok_sayim_farki_not_bicimi CHECK (btrim(karar_notu) <> '' AND length(karar_notu) <= 200),
  hareket_id bigint REFERENCES stok_hareketi,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_sayim_farki_parti_malzemesi FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id),
  CONSTRAINT stok_sayim_farki_fark_var CHECK (sayilan_miktar <> sistem_miktar),
  CONSTRAINT stok_sayim_farki_karar_tutarli CHECK ((durum = 'bekliyor') = (karar_kisi_id IS NULL) AND (karar_kisi_id IS NULL) = (karar_zamani IS NULL)),
  CONSTRAINT stok_sayim_farki_ikinci_kisi CHECK (karar_kisi_id IS DISTINCT FROM sayan_kisi_id),
  CONSTRAINT stok_sayim_farki_onay_hareketli CHECK ((durum = 'onaylandi') = (hareket_id IS NOT NULL)),
  CONSTRAINT stok_sayim_farki_red_nedenli CHECK (durum <> 'reddedildi' OR karar_notu IS NOT NULL)
);
CREATE UNIQUE INDEX stok_sayim_farki_bekleyen_tek ON stok_sayim_farki (konum_id, malzeme_id, (COALESCE(parti_id, 0))) WHERE durum = 'bekliyor';
CREATE INDEX stok_sayim_farki_durum_idx ON stok_sayim_farki (durum, id);
CREATE INDEX stok_sayim_farki_malzeme_idx ON stok_sayim_farki (malzeme_id);
CREATE INDEX stok_sayim_farki_parti_idx ON stok_sayim_farki (parti_id) WHERE parti_id IS NOT NULL;
CREATE INDEX stok_sayim_farki_hareket_idx ON stok_sayim_farki (hareket_id) WHERE hareket_id IS NOT NULL;

-- Sayım farkı onayı yalnız müdürde (1691 teyit). Kişiye verilmiş ek işlemlere dokunulmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'stok.sayim-onayla' FROM rol r WHERE r.kod = 'mudur'
ON CONFLICT (rol_id, islem) DO NOTHING;
