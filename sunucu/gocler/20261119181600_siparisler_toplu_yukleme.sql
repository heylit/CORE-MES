-- 3455-3: Excel'den toplu yüklenen satış siparişleri. Yalnız ekler: yükleme defteri ve siparişte boş olabilen bağ; var olan sipariş değişmez.
-- Aynı dosyanın ikinci kez yüklenmesini SIP-08 tekil dizini (firma, müşteri sipariş no) durdurur; toplu yüklemede müşteri sipariş no zorunludur.
CREATE TABLE siparisler_toplu_yukleme (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  yukleyen_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  dosya_adi text NOT NULL CONSTRAINT siparisler_toplu_yukleme_dosya_adi CHECK (btrim(dosya_adi) <> '' AND length(dosya_adi) <= 120),
  siparis_sayisi int NOT NULL CONSTRAINT siparisler_toplu_yukleme_siparis_sayisi CHECK (siparis_sayisi > 0),
  satir_sayisi int NOT NULL CONSTRAINT siparisler_toplu_yukleme_satir_sayisi CHECK (satir_sayisi >= siparis_sayisi)
);
CREATE TRIGGER siparisler_toplu_yukleme_degismez BEFORE UPDATE OR DELETE ON siparisler_toplu_yukleme
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER siparisler_toplu_yukleme_bosaltilmaz BEFORE TRUNCATE ON siparisler_toplu_yukleme
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

ALTER TABLE siparisler_siparis ADD COLUMN toplu_yukleme_id int CONSTRAINT siparisler_siparis_toplu_yukleme REFERENCES siparisler_toplu_yukleme;
ALTER TABLE siparisler_siparis ADD CONSTRAINT siparisler_siparis_toplu_musteri_no CHECK (toplu_yukleme_id IS NULL OR musteri_siparis_no IS NOT NULL) NOT VALID;
ALTER TABLE siparisler_siparis VALIDATE CONSTRAINT siparisler_siparis_toplu_musteri_no;
CREATE INDEX siparisler_siparis_toplu_yukleme_dizini ON siparisler_siparis (toplu_yukleme_id) WHERE toplu_yukleme_id IS NOT NULL;
-- 3455-logo c: yüklemede "Logo'ya bağlanacak" işareti; gönderim değildir, siparişin Logo'daki kaydına elle bağlanacağını söyler.
ALTER TABLE siparisler_siparis ADD COLUMN logo_baglanacak boolean NOT NULL DEFAULT false;
