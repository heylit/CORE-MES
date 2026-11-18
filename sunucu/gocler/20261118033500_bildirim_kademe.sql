-- 3405 a: kademeli uyarı bütün sistem için tek motordadır. Kaynak kodda tanımlıdır (paylasilan/sozlesme/kademe-sabitleri.ts); ayar
-- satırı yalnız değiştirilen kaynakta vardır, yoksa katalog varsayılanı geçer. Defter (kaynak, kayıt, kademe) tekildir ve yalnız eklenir:
-- kesinti ya da iki sunucu aynı kademeyi iki kez göndermez (Risk K6, K7). Takip, açık kaydın son durumudur (Gecikenlerim, şerit).
CREATE TABLE bildirim_kademe_ayari (
  kaynak text PRIMARY KEY CONSTRAINT bildirim_kademe_ayari_kaynak CHECK (kaynak ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  acik boolean NOT NULL,
  k2_gun int CONSTRAINT bildirim_kademe_ayari_k2 CHECK (k2_gun BETWEEN 0 AND 60),
  k3_gun int CONSTRAINT bildirim_kademe_ayari_k3 CHECK (k3_gun BETWEEN 0 AND 60),
  k4_gun int CONSTRAINT bildirim_kademe_ayari_k4 CHECK (k4_gun BETWEEN 0 AND 60),
  k5_gun int CONSTRAINT bildirim_kademe_ayari_k5 CHECK (k5_gun BETWEEN 0 AND 60),
  eposta_kademe smallint NOT NULL CONSTRAINT bildirim_kademe_ayari_eposta CHECK (eposta_kademe BETWEEN 2 AND 5),
  serit boolean NOT NULL,
  kapatilamaz boolean NOT NULL,
  yonetici_rol_id int CONSTRAINT bildirim_kademe_ayari_rol REFERENCES rol (id),
  surum int NOT NULL DEFAULT 1 CONSTRAINT bildirim_kademe_ayari_surum CHECK (surum >= 1),
  degistiren_id int CONSTRAINT bildirim_kademe_ayari_degistiren REFERENCES kisi (id),
  degisti timestamptz,
  CONSTRAINT bildirim_kademe_ayari_sira CHECK (k4_gun IS NULL OR k5_gun IS NULL OR k5_gun > k4_gun)
);

-- Kaynağın motorda ilk çalıştığı an. İlk çalışmada var olan kademeler bildirimsiz deftere yazılır: toplu e-posta gitmez (Risk K5).
CREATE TABLE bildirim_kademe_baslangic (
  kaynak text PRIMARY KEY,
  an timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bildirim_kademe_defteri (
  kaynak text NOT NULL,
  kayit text NOT NULL CONSTRAINT bildirim_kademe_defteri_kayit CHECK (btrim(kayit) <> '' AND length(kayit) <= 200),
  kademe smallint NOT NULL CONSTRAINT bildirim_kademe_defteri_no CHECK (kademe BETWEEN 1 AND 5),
  an timestamptz NOT NULL DEFAULT now(),
  bildirildi boolean NOT NULL,
  alici_sayisi int NOT NULL DEFAULT 0 CONSTRAINT bildirim_kademe_defteri_alici CHECK (alici_sayisi >= 0),
  CONSTRAINT bildirim_kademe_defteri_tekil PRIMARY KEY (kaynak, kayit, kademe)
);
CREATE TRIGGER bildirim_kademe_defteri_yalniz_ekleme BEFORE UPDATE OR DELETE ON bildirim_kademe_defteri
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER bildirim_kademe_defteri_bosaltilmaz BEFORE TRUNCATE ON bildirim_kademe_defteri
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Açık kaydın son okunan hâli. Kaynak kaydı artık vermeyince satır silinir ve kademe bildirimleri kapanır.
CREATE TABLE bildirim_kademe_takip (
  kaynak text NOT NULL,
  kayit text NOT NULL,
  no text NOT NULL CONSTRAINT bildirim_kademe_takip_no CHECK (length(no) <= 100),
  baslik text NOT NULL CONSTRAINT bildirim_kademe_takip_baslik CHECK (length(baslik) <= 200),
  yol text NOT NULL,
  son_gun date,
  baslangic date,
  kademe smallint NOT NULL CONSTRAINT bildirim_kademe_takip_kademe CHECK (kademe BETWEEN 0 AND 5),
  gecikme_gun int,
  yapanlar int[] NOT NULL DEFAULT '{}',
  ustler int[] NOT NULL DEFAULT '{}',
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bildirim_kademe_takip_tekil PRIMARY KEY (kaynak, kayit)
);
CREATE INDEX bildirim_kademe_takip_yapan ON bildirim_kademe_takip USING gin (yapanlar);
CREATE INDEX bildirim_kademe_takip_ust ON bildirim_kademe_takip USING gin (ustler);

-- Devret kademesindeki açık kayıtların sabah özeti kaynak başına günde bir kez.
CREATE TABLE bildirim_kademe_ozet (
  kaynak text NOT NULL,
  gun date NOT NULL,
  an timestamptz NOT NULL DEFAULT now(),
  kayit_sayisi int NOT NULL CONSTRAINT bildirim_kademe_ozet_sayi CHECK (kayit_sayisi >= 0),
  CONSTRAINT bildirim_kademe_ozet_tekil PRIMARY KEY (kaynak, gun)
);

-- 3396 hazırlık kademesi ortak motora geçer: ayar ve defter yalnız eklenerek kopyalanır, eski tablolar kalır (Risk K7). Kaynak
-- başlamış sayılır: defter dolu olduğundan ilk çalışma sessiz geçmez, yeni kademe her zamanki gibi bildirilir.
INSERT INTO bildirim_kademe_ayari (kaynak, acik, k2_gun, k3_gun, k4_gun, k5_gun, eposta_kademe, serit, kapatilamaz, yonetici_rol_id, degistiren_id, degisti)
SELECT 'projeler.hazirlik', true, hatirlat_gun, NULL, yonetici_gun, greatest(devret_gun, yonetici_gun + 1), 2, true, true, yonetici_rol_id, degistiren_id, degisti
  FROM projeler_hazirlik_kademe_ayari
 WHERE hatirlat_gun <> 1 OR yonetici_gun <> 1 OR devret_gun <> 2 OR yonetici_rol_id IS NOT NULL;
INSERT INTO bildirim_kademe_defteri (kaynak, kayit, kademe, an, bildirildi, alici_sayisi)
SELECT 'projeler.hazirlik', gorev_id::text, kademe, an, bildirildi, alici_sayisi FROM projeler_hazirlik_kademe;
INSERT INTO bildirim_kademe_ozet (kaynak, gun, an, kayit_sayisi)
SELECT 'projeler.hazirlik', gun, an, gorev_sayisi FROM projeler_hazirlik_ozet;
INSERT INTO bildirim_kademe_baslangic (kaynak) VALUES ('projeler.hazirlik');

-- 3405-1 a: satın alma hatırlatmalarının gün ayarları aynen taşınır. Satırı olmayan ayar varsayılandır (katalog aynı günlerle gelir);
-- boş (json null) değer o hatırlatmayı kapatıyordu: kaynak kapalı gelir. Hiçbiri değiştirilmemişse satır yazılmaz.
WITH a AS (
  SELECT replace(anahtar, 'satin-alma.hatirlatma-', '') AS ad, deger FROM ayar WHERE anahtar IN (
    'satin-alma.hatirlatma-onay-bekliyor', 'satin-alma.hatirlatma-siparis-bekliyor', 'satin-alma.hatirlatma-teklif-cevapsiz',
    'satin-alma.hatirlatma-teslim-yaklasiyor', 'satin-alma.hatirlatma-teslim-gecikti-yonetici')
), g AS (
  SELECT ad, jsonb_typeof(deger) = 'null' AS bos, (deger #>> '{}')::int AS gun FROM a
), v (kaynak, acik, k2, k3, k4, k5, serit) AS (
  SELECT 'satin-alma.talep-onay', NOT coalesce((SELECT bos FROM g WHERE ad = 'onay-bekliyor'), false),
         NULL::int, coalesce((SELECT gun FROM g WHERE ad = 'onay-bekliyor'), 2), 2, 5, true
  UNION ALL
  SELECT 'satin-alma.siparis-verilmedi', NOT coalesce((SELECT bos FROM g WHERE ad = 'siparis-bekliyor'), false),
         NULL, coalesce((SELECT gun FROM g WHERE ad = 'siparis-bekliyor'), 1), 2, 5, true
  UNION ALL
  SELECT 'satin-alma.teklif-cevapsiz', NOT coalesce((SELECT bos FROM g WHERE ad = 'teklif-cevapsiz'), false),
         NULL, coalesce((SELECT gun FROM g WHERE ad = 'teklif-cevapsiz'), 3), 3, NULL, false
  UNION ALL
  SELECT 'satin-alma.teslim', NOT (coalesce((SELECT bos FROM g WHERE ad = 'teslim-yaklasiyor'), false) AND coalesce((SELECT bos FROM g WHERE ad = 'teslim-gecikti-yonetici'), false)),
         (SELECT gun FROM g WHERE ad = 'teslim-yaklasiyor') , NULL, greatest(1, coalesce((SELECT gun FROM g WHERE ad = 'teslim-gecikti-yonetici'), 3)), 5, true
)
INSERT INTO bildirim_kademe_ayari (kaynak, acik, k2_gun, k3_gun, k4_gun, k5_gun, eposta_kademe, serit, kapatilamaz)
SELECT kaynak, acik, CASE WHEN kaynak = 'satin-alma.teslim' AND NOT EXISTS (SELECT 1 FROM g WHERE ad = 'teslim-yaklasiyor') THEN 3 ELSE k2 END,
       k3, k4, CASE WHEN k5 IS NOT NULL THEN greatest(k5, k4 + 1) END, 3, serit, serit
  FROM v WHERE EXISTS (SELECT 1 FROM g);
