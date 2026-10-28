-- Talimat adımının resim ve videoları (995 a, 1004 a): içerik ortak dosya deposundadır (ADR 0009), rota yalnız künyeyi tutar.
-- Bağ dosya modülünde özet başına tek kayıttır (`medya:<özet>`): aynı dosya sürümlerde ve şablon kopyasında yeniden yüklenmeden kullanılır.
-- Boyut ürün başına sınır (1 GB) için tutulur; tür resim ya da video.
CREATE TABLE rota_talimat_adim_medyasi (
  talimat_id int NOT NULL,
  adim_sira int NOT NULL,
  sira int NOT NULL CONSTRAINT rota_talimat_adim_medyasi_sira_pozitif CHECK (sira > 0),
  ozet text NOT NULL CONSTRAINT rota_talimat_adim_medyasi_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  tur text NOT NULL CONSTRAINT rota_talimat_adim_medyasi_tur_gecerli CHECK (tur IN ('resim', 'video')),
  ad text NOT NULL CONSTRAINT rota_talimat_adim_medyasi_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  boyut bigint NOT NULL CONSTRAINT rota_talimat_adim_medyasi_boyut_pozitif CHECK (boyut > 0),
  PRIMARY KEY (talimat_id, adim_sira, sira),
  CONSTRAINT rota_talimat_adim_medyasi_adim_bagi FOREIGN KEY (talimat_id, adim_sira) REFERENCES rota_talimat_adimi (talimat_id, sira)
);
CREATE INDEX rota_talimat_adim_medyasi_ozet_idx ON rota_talimat_adim_medyasi (ozet);
-- Emre sabitlenen sürümün medyası da değişmez.
CREATE TRIGGER rota_talimat_adim_medyasi_degismez BEFORE UPDATE OR DELETE ON rota_talimat_adim_medyasi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_talimat_adim_medyasi_bosaltilmaz BEFORE TRUNCATE ON rota_talimat_adim_medyasi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Şablon adımları kaydette yeniden yazıldığı için medyası adımla birlikte silinir.
CREATE TABLE rota_talimat_sablon_adim_medyasi (
  sablon_id int NOT NULL,
  adim_sira int NOT NULL,
  sira int NOT NULL CONSTRAINT rota_talimat_sablon_adim_medyasi_sira_pozitif CHECK (sira > 0),
  ozet text NOT NULL CONSTRAINT rota_talimat_sablon_adim_medyasi_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  tur text NOT NULL CONSTRAINT rota_talimat_sablon_adim_medyasi_tur_gecerli CHECK (tur IN ('resim', 'video')),
  ad text NOT NULL CONSTRAINT rota_talimat_sablon_adim_medyasi_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  boyut bigint NOT NULL CONSTRAINT rota_talimat_sablon_adim_medyasi_boyut_pozitif CHECK (boyut > 0),
  PRIMARY KEY (sablon_id, adim_sira, sira),
  CONSTRAINT rota_talimat_sablon_adim_medyasi_adim_bagi FOREIGN KEY (sablon_id, adim_sira)
    REFERENCES rota_talimat_sablon_adimi (sablon_id, sira) ON DELETE CASCADE
);
CREATE INDEX rota_talimat_sablon_adim_medyasi_ozet_idx ON rota_talimat_sablon_adim_medyasi (ozet);
