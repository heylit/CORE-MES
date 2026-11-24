-- 3675 D1: Logo fatura başlığı ve cari hareket aynası (yalnız okunur; Logo'ya ve finans tablolarına yazılmaz).
-- Alan adları köprü sözleşmesine göredir (logo/fatura-cari-sozlesmesi.ts, doğrulanmadı); Logo sütunu değildir.

CREATE TABLE logo_fatura_baslik (
  firma int NOT NULL CONSTRAINT logo_fatura_baslik_firma CHECK (firma > 0),
  donem int NOT NULL CONSTRAINT logo_fatura_baslik_donem CHECK (donem > 0),
  logo_kayit_no bigint NOT NULL CONSTRAINT logo_fatura_baslik_ref CHECK (logo_kayit_no > 0),
  -- Yön ve iade: satis, alis, satis-iade, alis-iade.
  tur text NOT NULL CONSTRAINT logo_fatura_baslik_tur CHECK (tur IN ('satis', 'alis', 'satis-iade', 'alis-iade')),
  fatura_no text NOT NULL CONSTRAINT logo_fatura_baslik_no CHECK (btrim(fatura_no) <> '' AND length(fatura_no) <= 40),
  tarih date NOT NULL,
  cari_kodu text CONSTRAINT logo_fatura_baslik_cari CHECK (cari_kodu IS NULL OR length(cari_kodu) <= 64),
  -- Döviz türü Logo numarasıdır (0 ya da boş: yerel para); tutarlar belge para biriminde.
  doviz_turu int,
  net numeric NOT NULL,
  kdv numeric NOT NULL,
  brut numeric NOT NULL,
  iptal boolean NOT NULL DEFAULT false,
  okuma_zamani timestamptz NOT NULL,
  PRIMARY KEY (firma, donem, logo_kayit_no)
);
CREATE INDEX logo_fatura_baslik_no ON logo_fatura_baslik (tur, fatura_no);
CREATE INDEX logo_fatura_baslik_cari ON logo_fatura_baslik (cari_kodu, tarih DESC);

CREATE TABLE logo_cari_hareket (
  firma int NOT NULL CONSTRAINT logo_cari_hareket_firma CHECK (firma > 0),
  donem int NOT NULL CONSTRAINT logo_cari_hareket_donem CHECK (donem > 0),
  logo_kayit_no bigint NOT NULL CONSTRAINT logo_cari_hareket_ref CHECK (logo_kayit_no > 0),
  cari_kodu text NOT NULL CONSTRAINT logo_cari_hareket_cari CHECK (btrim(cari_kodu) <> '' AND length(cari_kodu) <= 64),
  tarih date NOT NULL,
  -- Belge türü köprünün sözlüğüdür (fatura, tahsilat, odeme, ...); serbest metin, eşleşmede yalnız gösterilir.
  tur text CONSTRAINT logo_cari_hareket_tur CHECK (tur IS NULL OR length(tur) <= 40),
  belge_no text CONSTRAINT logo_cari_hareket_belge CHECK (belge_no IS NULL OR length(belge_no) <= 40),
  borc numeric NOT NULL DEFAULT 0 CONSTRAINT logo_cari_hareket_borc CHECK (borc >= 0),
  alacak numeric NOT NULL DEFAULT 0 CONSTRAINT logo_cari_hareket_alacak CHECK (alacak >= 0),
  doviz_turu int,
  okuma_zamani timestamptz NOT NULL,
  PRIMARY KEY (firma, donem, logo_kayit_no)
);
CREATE INDEX logo_cari_hareket_cari ON logo_cari_hareket (cari_kodu, tarih DESC);
CREATE TRIGGER logo_cari_hareket_yalniz_ekleme BEFORE UPDATE OR DELETE ON logo_cari_hareket FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER logo_cari_hareket_bosaltma_yok BEFORE TRUNCATE ON logo_cari_hareket FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Okuma imleci akış (fatura-<tür> ya da cari-hareket), firma ve dönem başına. dolu: son sayfa doluydu, okuma beklemeden sürer.
CREATE TABLE logo_fatura_cari_imleci (
  akis text NOT NULL CONSTRAINT logo_fatura_cari_imleci_akis CHECK (akis IN ('fatura-satis', 'fatura-alis', 'fatura-satis-iade', 'fatura-alis-iade', 'cari-hareket')),
  firma int NOT NULL CONSTRAINT logo_fatura_cari_imleci_firma CHECK (firma > 0),
  donem int NOT NULL CONSTRAINT logo_fatura_cari_imleci_donem CHECK (donem > 0),
  son_ref bigint NOT NULL DEFAULT 0 CONSTRAINT logo_fatura_cari_imleci_ref CHECK (son_ref >= 0),
  dolu boolean NOT NULL DEFAULT false,
  son_okuma timestamptz NOT NULL,
  PRIMARY KEY (akis, firma, donem)
);
