-- Teknik resim, 3B model, balon (kontrol planı), numune planı, numune ve ölçümün sahibi Kalite Merkezi'dir (595 1 b, 597 a, 600 a).
-- Arkon kalite istasyonu ve Hazırlık buradan okur; kararı ve ölçümü Kalite Merkezi'nin disari.ts komutuyla yazar. Dosyanın sahibi
-- belge merkezidir (cizimler): resim, alındığı yayındaki revizyonu belge kimliği ve özetle tutar; içerik kopyalanmaz. Tablolar boş
-- açılır; Arkon'daki ve Kalite Merkezi'nin eski kayıtlarının taşınması ayrı göç ve ayrı onaydır (595 3 c).

CREATE TABLE kalite_merkezi_resim (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_no int NOT NULL CONSTRAINT kalite_merkezi_resim_malzeme REFERENCES malzeme_katalog_karti (no),
  tur text NOT NULL CONSTRAINT kalite_merkezi_resim_tur CHECK (tur IN ('resim', 'model')),
  merkez_belge_id int NOT NULL CONSTRAINT kalite_merkezi_resim_belge REFERENCES cizimler_belge (id),
  ozet text NOT NULL CONSTRAINT kalite_merkezi_resim_dosya REFERENCES dosya (ozet),
  ad text NOT NULL CONSTRAINT kalite_merkezi_resim_ad CHECK (btrim(ad) <> '' AND length(ad) <= 200),
  -- Parçanın resimdeki revizyonu (kullanıcının yazdığı); belge merkezinin revizyon harfinden ayrıdır.
  revizyon text CONSTRAINT kalite_merkezi_resim_revizyon CHECK (revizyon IS NULL OR (btrim(revizyon) <> '' AND length(revizyon) <= 20)),
  aktif boolean NOT NULL DEFAULT true,
  surum int NOT NULL DEFAULT 1 CONSTRAINT kalite_merkezi_resim_surum CHECK (surum >= 1),
  ekleyen_id int NOT NULL REFERENCES kisi,
  eklendi timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int NOT NULL REFERENCES kisi,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kalite_merkezi_resim_tekil UNIQUE (malzeme_no, merkez_belge_id, ozet)
);
CREATE INDEX kalite_merkezi_resim_parca ON kalite_merkezi_resim (malzeme_no, aktif, id);
CREATE INDEX kalite_merkezi_resim_belge_idx ON kalite_merkezi_resim (merkez_belge_id);
CREATE INDEX kalite_merkezi_resim_ozet_idx ON kalite_merkezi_resim (ozet);
CREATE INDEX kalite_merkezi_resim_ekleyen_idx ON kalite_merkezi_resim (ekleyen_id);
CREATE INDEX kalite_merkezi_resim_guncelleyen_idx ON kalite_merkezi_resim (guncelleyen_id);

-- Balon: resimdeki ölçü ve kontrol planı satırı. Sınırlar sayısal ölçüde doludur; nitel ölçüde (geçer/geçmez) ikisi de boştur.
-- Konum stüdyonun kendi sayfa koordinatıdır (sayfa, nokta, döndürülmüş yazı kutusu: merkez x, y, yarı en, yarı boy, açı).
CREATE TABLE kalite_merkezi_balon (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resim_id int NOT NULL CONSTRAINT kalite_merkezi_balon_resim REFERENCES kalite_merkezi_resim (id),
  no int NOT NULL CONSTRAINT kalite_merkezi_balon_no CHECK (no >= 1),
  nominal text NOT NULL CONSTRAINT kalite_merkezi_balon_nominal CHECK (btrim(nominal) <> '' AND length(nominal) <= 80),
  tolerans text CONSTRAINT kalite_merkezi_balon_tolerans CHECK (tolerans IS NULL OR length(tolerans) <= 80),
  alt numeric,
  ust numeric,
  alet text CONSTRAINT kalite_merkezi_balon_alet CHECK (alet IS NULL OR length(alet) <= 80),
  siklik text CONSTRAINT kalite_merkezi_balon_siklik CHECK (siklik IS NULL OR length(siklik) <= 80),
  kritik boolean NOT NULL DEFAULT false,
  yontem text CONSTRAINT kalite_merkezi_balon_yontem CHECK (yontem IS NULL OR yontem IN ('cmm', 'elle')),
  olcu_aleti_gerekir boolean NOT NULL DEFAULT false,
  tur text CONSTRAINT kalite_merkezi_balon_tur CHECK (tur IS NULL OR length(tur) <= 40),
  sayfa int CONSTRAINT kalite_merkezi_balon_sayfa CHECK (sayfa IS NULL OR sayfa >= 1),
  x double precision,
  y double precision,
  yazi_kutusu double precision[] CONSTRAINT kalite_merkezi_balon_yazi_kutusu CHECK (yazi_kutusu IS NULL OR cardinality(yazi_kutusu) = 5),
  aktif boolean NOT NULL DEFAULT true,
  surum int NOT NULL DEFAULT 1 CONSTRAINT kalite_merkezi_balon_surum CHECK (surum >= 1),
  guncelleyen_id int NOT NULL REFERENCES kisi,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  -- Sınır sonlu ondalıktır (NaN ve sonsuz numeric'te geçerlidir): uygunluk kuralı sınırı basamak basamak karşılaştırır.
  CONSTRAINT kalite_merkezi_balon_sinir CHECK ((alt IS NULL) = (ust IS NULL) AND (alt IS NULL OR (alt::text ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND ust::text ~ '^-?[0-9]+(\.[0-9]+)?$' AND alt <= ust))),
  CONSTRAINT kalite_merkezi_balon_konum CHECK ((x IS NULL) = (y IS NULL)),
  CONSTRAINT kalite_merkezi_balon_no_tekil UNIQUE (resim_id, no)
);
CREATE INDEX kalite_merkezi_balon_guncelleyen_idx ON kalite_merkezi_balon (guncelleyen_id);

-- Numune planı parça ve operasyon başınadır: kurallar (ilk parça, her n parça, süre, vardiya, son parça), kimin ölçtüğü ve hangi
-- balonların ölçüldüğü. Kural listesi sunucu kuralıyla doğrulanır; biçimi paylasilan/sozlesme/kalite-merkezi-studyo.ts'dedir.
CREATE TABLE kalite_merkezi_numune_plani (
  malzeme_no int NOT NULL CONSTRAINT kalite_merkezi_numune_plani_malzeme REFERENCES malzeme_katalog_karti (no),
  op_no int NOT NULL CONSTRAINT kalite_merkezi_numune_plani_op CHECK (op_no >= 1),
  kurallar jsonb NOT NULL CONSTRAINT kalite_merkezi_numune_plani_kurallar CHECK (jsonb_typeof(kurallar) = 'array'),
  surum int NOT NULL DEFAULT 1 CONSTRAINT kalite_merkezi_numune_plani_surum CHECK (surum >= 1),
  guncelleyen_id int NOT NULL REFERENCES kisi,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (malzeme_no, op_no)
);
CREATE INDEX kalite_merkezi_numune_plani_guncelleyen_idx ON kalite_merkezi_numune_plani (guncelleyen_id);

-- Numune isteği (operatör ya da kural açar) ve kararı. İstek ve karar yalnız eklenir; durum karardan ve ölçümden türer
-- (karar yoksa bekliyor ya da ölçülüyor). Bir isteğin tek kararı vardır.
CREATE TABLE kalite_merkezi_numune (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL CONSTRAINT kalite_merkezi_numune_emir REFERENCES uretim_emri (id),
  op_no int NOT NULL CONSTRAINT kalite_merkezi_numune_op CHECK (op_no >= 1),
  balonlar int[] NOT NULL CONSTRAINT kalite_merkezi_numune_balonlar CHECK (cardinality(balonlar) BETWEEN 1 AND 500),
  kritik boolean NOT NULL DEFAULT false,
  neden text NOT NULL CONSTRAINT kalite_merkezi_numune_neden CHECK (btrim(neden) <> '' AND length(neden) <= 80),
  parca_sayisi int CONSTRAINT kalite_merkezi_numune_parca_sayisi CHECK (parca_sayisi IS NULL OR parca_sayisi >= 0),
  isteyen_id int NOT NULL REFERENCES kisi,
  istendi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kalite_merkezi_numune_emir ON kalite_merkezi_numune (uretim_emri_id, op_no, istendi DESC, id DESC);
CREATE INDEX kalite_merkezi_numune_isteyen_idx ON kalite_merkezi_numune (isteyen_id);

CREATE TABLE kalite_merkezi_numune_karari (
  numune_id bigint PRIMARY KEY CONSTRAINT kalite_merkezi_numune_karari_numune REFERENCES kalite_merkezi_numune (id),
  karar text NOT NULL CONSTRAINT kalite_merkezi_numune_karari_karar CHECK (karar IN ('onay', 'ret', 'sapma')),
  "not" text CONSTRAINT kalite_merkezi_numune_karari_not CHECK ("not" IS NULL OR (btrim("not") <> '' AND length("not") <= 500)),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kalite_merkezi_numune_karari_ret_gerekcesi CHECK (karar <> 'ret' OR "not" IS NOT NULL)
);
CREATE INDEX kalite_merkezi_numune_karari_kisi_idx ON kalite_merkezi_numune_karari (kisi_id);

-- Ölçüm: balon başına değer ya da nitel sonuç; uygunluk sunucuda balonun sınırından hesaplanır. Numuneye ya da (numunesiz,
-- operatörün kendi ölçümü) yalnız emre bağlıdır. Yalnız eklenir: düzeltme yeni ölçümdür.
CREATE TABLE kalite_merkezi_olcum (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  balon_id int NOT NULL CONSTRAINT kalite_merkezi_olcum_balon REFERENCES kalite_merkezi_balon (id),
  uretim_emri_id int NOT NULL CONSTRAINT kalite_merkezi_olcum_emir REFERENCES uretim_emri (id),
  numune_id bigint CONSTRAINT kalite_merkezi_olcum_numune REFERENCES kalite_merkezi_numune (id),
  deger numeric,
  nitel text CONSTRAINT kalite_merkezi_olcum_nitel CHECK (nitel IS NULL OR nitel IN ('gecer', 'gecmez')),
  uygun boolean NOT NULL,
  kaynak text NOT NULL CONSTRAINT kalite_merkezi_olcum_kaynak CHECK (kaynak IN ('operator', 'kalite', 'cmm')),
  parca_sayisi int CONSTRAINT kalite_merkezi_olcum_parca_sayisi CHECK (parca_sayisi IS NULL OR parca_sayisi >= 0),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kalite_merkezi_olcum_tek_deger CHECK ((deger IS NULL) <> (nitel IS NULL) AND (deger IS NULL OR deger::text ~ '^-?[0-9]+(\.[0-9]+)?$'))
);
CREATE INDEX kalite_merkezi_olcum_emir ON kalite_merkezi_olcum (uretim_emri_id, zaman DESC, id DESC);
CREATE INDEX kalite_merkezi_olcum_numune_idx ON kalite_merkezi_olcum (numune_id);
CREATE INDEX kalite_merkezi_olcum_balon_idx ON kalite_merkezi_olcum (balon_id);
CREATE INDEX kalite_merkezi_olcum_kisi_idx ON kalite_merkezi_olcum (kisi_id);

CREATE TRIGGER kalite_merkezi_numune_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_numune
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalite_merkezi_numune_bosaltilmaz BEFORE TRUNCATE ON kalite_merkezi_numune
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalite_merkezi_numune_karari_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_numune_karari
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalite_merkezi_numune_karari_bosaltilmaz BEFORE TRUNCATE ON kalite_merkezi_numune_karari
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalite_merkezi_olcum_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_olcum
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalite_merkezi_olcum_bosaltilmaz BEFORE TRUNCATE ON kalite_merkezi_olcum
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
