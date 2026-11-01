-- Bakiye ile hareket defterinin gece karşılaştırması (1692 a). Her tur bir satır bırakır; farklar o turun altında saklanır.
-- 1692 b tetiği yeni yazımı korur; bu karşılaştırma geçmişte oluşmuş ve tetiğin dışında (tablo sahibiyle) yapılmış farkı gösterir.
-- Yeni iki boş tablo; var olan veri değişmez.
CREATE TABLE stok_defter_karsilastirma (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zaman timestamptz NOT NULL DEFAULT now(),
  fark_sayisi int NOT NULL CONSTRAINT stok_defter_karsilastirma_sayi CHECK (fark_sayisi >= 0)
);
CREATE INDEX stok_defter_karsilastirma_zaman_idx ON stok_defter_karsilastirma (zaman DESC);

CREATE TABLE stok_defter_farki (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  karsilastirma_id bigint NOT NULL REFERENCES stok_defter_karsilastirma,
  malzeme_id integer NOT NULL,
  konum_id int NOT NULL,
  parti_id bigint,
  statu_id int,
  kalite_durumu text NOT NULL,
  bakiye numeric(14,3) NOT NULL,
  defter numeric(14,3) NOT NULL,
  CONSTRAINT stok_defter_farki_fark_var CHECK (bakiye <> defter)
);
CREATE INDEX stok_defter_farki_karsilastirma_idx ON stok_defter_farki (karsilastirma_id);

-- Karşılaştırma kaydı iz kaydıdır: değiştirilmez, silinmez.
CREATE TRIGGER stok_defter_karsilastirma_degismez BEFORE UPDATE OR DELETE ON stok_defter_karsilastirma FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_defter_karsilastirma_bosaltilmaz BEFORE TRUNCATE ON stok_defter_karsilastirma FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_defter_farki_degismez BEFORE UPDATE OR DELETE ON stok_defter_farki FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_defter_farki_bosaltilmaz BEFORE TRUNCATE ON stok_defter_farki FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
