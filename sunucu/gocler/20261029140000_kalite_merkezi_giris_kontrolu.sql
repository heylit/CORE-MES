-- 1246 giriş kontrolü (1251 a, 1252, 1253 a; kullanıcı teyidi 30.10.2026): emre bağlı olmayan satın alma lotunun kararları. İki aşama
-- yalnız eklenir: GKK (kabul ve hatalı miktar) ve hatalının kalite kararı (kabul, şartlı kabul, red; NCR ile). Stok hareketleri
-- stoktadır; burada kim, ne zaman, hangi kararı verdi tutulur. Satır başına her aşama bir kezdir.
CREATE TABLE kalite_merkezi_giris_karari (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mal_kabul_satiri_id bigint NOT NULL REFERENCES stok_mal_kabul_satiri (id),
  asama text NOT NULL CONSTRAINT kalite_merkezi_giris_karari_asama CHECK (asama IN ('gkk', 'karar')),
  kabul_miktar numeric(14, 3) CONSTRAINT kalite_merkezi_giris_karari_kabul CHECK (kabul_miktar >= 0),
  hatali_miktar numeric(14, 3) CONSTRAINT kalite_merkezi_giris_karari_hatali CHECK (hatali_miktar >= 0),
  karar text CONSTRAINT kalite_merkezi_giris_karari_karar CHECK (karar IN ('kabul', 'sartli_kabul', 'red')),
  ncr_kimlik text,
  ncr_no text,
  aciklama text CONSTRAINT kalite_merkezi_giris_karari_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 500)),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kalite_merkezi_giris_karari_gkk CHECK (asama <> 'gkk' OR (
    kabul_miktar IS NOT NULL AND hatali_miktar IS NOT NULL AND kabul_miktar + hatali_miktar > 0 AND karar IS NULL AND ncr_kimlik IS NULL)),
  CONSTRAINT kalite_merkezi_giris_karari_kalite CHECK (asama <> 'karar' OR (
    karar IS NOT NULL AND ncr_kimlik IS NOT NULL AND ncr_no IS NOT NULL AND kabul_miktar IS NULL AND hatali_miktar IS NULL)),
  CONSTRAINT kalite_merkezi_giris_karari_sartli_not CHECK (karar IS DISTINCT FROM 'sartli_kabul' OR aciklama IS NOT NULL),
  CONSTRAINT kalite_merkezi_giris_karari_tek UNIQUE (mal_kabul_satiri_id, asama)
);

CREATE TRIGGER kalite_merkezi_giris_karari_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_giris_karari
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalite_merkezi_giris_karari_bosaltilmaz BEFORE TRUNCATE ON kalite_merkezi_giris_karari
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
