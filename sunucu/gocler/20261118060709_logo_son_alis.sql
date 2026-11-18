-- 3384-c a: Logo alış faturası satırlarının kopyası; teklif ve proje maliyetinde "Logo son alış" önerisi buradan okunur, hesaba girmez.
-- Yeni, boş tablolar ve yalnız logo modülünündür; var olan hiçbir satır yazılmaz, silinmez. Kopya yalnız eklenir (Logo'ya yazılmaz).
CREATE TABLE logo_son_alis (
  firma int NOT NULL CONSTRAINT logo_son_alis_firma CHECK (firma > 0),
  donem int NOT NULL CONSTRAINT logo_son_alis_donem CHECK (donem > 0),
  -- Dönem tablosundaki satır kaydı (STLINE.LOGICALREF); dönem değişince numara yeniden başlar.
  logo_kayit_no bigint NOT NULL CONSTRAINT logo_son_alis_ref CHECK (logo_kayit_no > 0),
  malzeme_kodu text NOT NULL CONSTRAINT logo_son_alis_kod CHECK (btrim(malzeme_kodu) <> '' AND length(malzeme_kodu) <= 64),
  tarih date NOT NULL,
  cari_kodu text CONSTRAINT logo_son_alis_cari CHECK (cari_kodu IS NULL OR length(cari_kodu) <= 64),
  fatura_no text CONSTRAINT logo_son_alis_fatura CHECK (fatura_no IS NULL OR length(fatura_no) <= 40),
  miktar numeric NOT NULL,
  birim text CONSTRAINT logo_son_alis_birim CHECK (birim IS NULL OR length(birim) <= 40),
  -- Satır birim fiyatı yerel para (TL); dövizli satırda döviz türü ve döviz fiyatı ayrıca, kur çevrilmez.
  fiyat numeric NOT NULL,
  doviz_turu int,
  doviz_fiyati numeric,
  okuma_zamani timestamptz NOT NULL,
  PRIMARY KEY (firma, donem, logo_kayit_no),
  CONSTRAINT logo_son_alis_doviz CHECK ((doviz_turu IS NULL) = (doviz_fiyati IS NULL))
);
CREATE INDEX logo_son_alis_malzeme ON logo_son_alis (malzeme_kodu, tarih DESC, logo_kayit_no DESC);
CREATE TRIGGER logo_son_alis_yalniz_ekleme BEFORE UPDATE OR DELETE ON logo_son_alis FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER logo_son_alis_bosaltma_yok BEFORE TRUNCATE ON logo_son_alis FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Okuma imleci firma ve dönem başına; son okunan dönem en son okunandır. dolu: son sayfa doluydu, okuma beklemeden sürer.
CREATE TABLE logo_son_alis_imleci (
  firma int NOT NULL CONSTRAINT logo_son_alis_imleci_firma CHECK (firma > 0),
  donem int NOT NULL CONSTRAINT logo_son_alis_imleci_donem CHECK (donem > 0),
  son_ref bigint NOT NULL DEFAULT 0 CONSTRAINT logo_son_alis_imleci_ref CHECK (son_ref >= 0),
  dolu boolean NOT NULL DEFAULT false,
  son_okuma timestamptz NOT NULL,
  PRIMARY KEY (firma, donem)
);
