-- Denetim Hazırlığı prototipinin verisi belge deposunda durur: prototip kayıtlarını koleksiyon ve belge yollarıyla tutar
-- (Firestore biçimi), TMI gövdeyi yorumlamaz. Sürüm tek sayaçtan gelir: her yazma ve silme sayacı ilerletir, çerçeve
-- sayacın son değerine bakarak değişikliği anlar. Kişi sütunları kisi tablosuna yabancı anahtarla Aşama 2'de bağlanır.
CREATE SEQUENCE denetim_hazirlik_surum AS bigint;

CREATE TABLE denetim_hazirlik_belge (
  yol text PRIMARY KEY,
  ust text NOT NULL,
  kimlik text NOT NULL,
  veri jsonb NOT NULL,
  surum bigint NOT NULL,
  olusturan_kisi_id int,
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  kilit_sahibi text,
  kilit_bitis timestamptz,
  CONSTRAINT denetim_hazirlik_belge_yol_butun CHECK (yol = ust || '/' || kimlik),
  CONSTRAINT denetim_hazirlik_belge_yol_bicimi CHECK (
    length(yol) <= 512
    AND yol ~ '^[A-Za-z0-9_.:@~+%-]{1,128}(/[A-Za-z0-9_.:@~+%-]{1,128})*$'
    AND cardinality(string_to_array(yol, '/')) % 2 = 0
  ),
  CONSTRAINT denetim_hazirlik_belge_veri_nesne CHECK (jsonb_typeof(veri) = 'object'),
  CONSTRAINT denetim_hazirlik_belge_kilit_butun CHECK ((kilit_sahibi IS NULL) = (kilit_bitis IS NULL))
);
-- Koleksiyon okuması üst yolla süzer ve kimliğe göre sıralar.
CREATE INDEX denetim_hazirlik_belge_ust ON denetim_hazirlik_belge (ust, kimlik);

-- Prototipin yüklediği ekler (görsel, PDF, metin). Boyut JSON gövde sınırının altındadır; dosya modülüne Aşama 2'de bağlanır.
CREATE TABLE denetim_hazirlik_ek (
  id text PRIMARY KEY,
  ad text NOT NULL,
  tur text NOT NULL,
  boyut int NOT NULL,
  icerik bytea NOT NULL,
  yukleyen_kisi_id int NOT NULL,
  yuklendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denetim_hazirlik_ek_id_bicimi CHECK (id ~ '^[0-9a-f]{32}$'),
  CONSTRAINT denetim_hazirlik_ek_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 200),
  CONSTRAINT denetim_hazirlik_ek_tur_bicimi CHECK (tur ~ '^[a-z]+/[a-z0-9.+-]+$'),
  CONSTRAINT denetim_hazirlik_ek_boyut CHECK (boyut > 0 AND boyut <= 716800 AND octet_length(icerik) = boyut)
);
