-- Reçete ve Rota verisinin yalnız recete_rota_kayit JSON'unda duran parçaları için gerçek tablolar (geçiş planı adım 3). Bu göç tabloları
-- boş açar; JSON'daki veri ayrı bir göçle kopyalanır, taşıma süresince okumalar JSON'la karşılaştırılır. Tabloya yalnız recete-rota yazar.

-- Elle tanımlanan statü (prototipte `statuses`: kod, ad, tür, renk). Rota adımından kendiliğinden açılan "OP n" statüsü recete_rota_statu'dadır.
CREATE TABLE recete_rota_statu_tanimi (
  kimlik text PRIMARY KEY,
  kod text NOT NULL,
  ad text NOT NULL,
  tur text NOT NULL,
  renk text NOT NULL,
  sira int NOT NULL,
  surum int NOT NULL DEFAULT 1,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recete_rota_statu_tanimi_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,40}$'),
  CONSTRAINT recete_rota_statu_tanimi_kod_dolu CHECK (btrim(kod) <> '' AND length(kod) <= 5),
  CONSTRAINT recete_rota_statu_tanimi_ad_dolu CHECK (btrim(ad) <> ''),
  CONSTRAINT recete_rota_statu_tanimi_tur CHECK (tur IN ('uretim', 'kalite', 'ret', 'giris')),
  CONSTRAINT recete_rota_statu_tanimi_renk_bicimi CHECK (renk ~ '^#[0-9A-Fa-f]{6}$')
);

-- Rota adımının bağı (prototipte adımın `outItem` ve `outStatus` alanı): adımın çıktısı başka bir karta dönüşür ya da tanımlı bir statüye
-- bağlanır. Bağlı adım "OP n" statüsü açmaz; çıktı kartı üretim sayımında stoğa girecek karttır. Adım, malzeme ve OP numarasıyla bilinir
-- (rota modülündeki adım kimliğiyle aynı); revizyondan bağımsızdır.
CREATE TABLE recete_rota_adim_bagi (
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  op_no int NOT NULL,
  cikti_malzeme_id int REFERENCES malzeme_katalog_karti (no),
  cikti_statu text REFERENCES recete_rota_statu_tanimi (kimlik),
  surum int NOT NULL DEFAULT 1,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (malzeme_id, op_no),
  CONSTRAINT recete_rota_adim_bagi_op_pozitif CHECK (op_no > 0),
  CONSTRAINT recete_rota_adim_bagi_dolu CHECK (cikti_malzeme_id IS NOT NULL OR cikti_statu IS NOT NULL)
);

-- Adıma giren malzemenin istenen statüsü (prototipte adım girdisinin `status` alanı): ya tanımlı bir statü ya da giren malzemenin kendi
-- rotasındaki bir ara adımın çıktısı ("OP n" statüsü, prototipte `step:<malzeme>-o<opNo>`).
CREATE TABLE recete_rota_giren_statusu (
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  op_no int NOT NULL,
  giren_malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  statu text REFERENCES recete_rota_statu_tanimi (kimlik),
  giren_op_no int,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (malzeme_id, op_no, giren_malzeme_id),
  CONSTRAINT recete_rota_giren_statusu_op_pozitif CHECK (op_no > 0 AND (giren_op_no IS NULL OR giren_op_no > 0)),
  CONSTRAINT recete_rota_giren_statusu_tek_kaynak CHECK ((statu IS NULL) <> (giren_op_no IS NULL))
);

-- Kartın statülü görünümü (prototipte `statusCards`): bir kartın hangi statüyle ayrı satır olarak listeleneceği.
CREATE TABLE recete_rota_statu_karti (
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  statu text NOT NULL REFERENCES recete_rota_statu_tanimi (kimlik),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (malzeme_id, statu)
);
