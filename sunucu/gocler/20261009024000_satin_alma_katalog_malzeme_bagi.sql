-- Katalog kalemi malzeme kartına zorunlu bağlıdır (kullanıcı kararı SA2 b, kart #162): malzeme_no dolu ve malzeme_katalog_karti(no)'ya bağlı.
-- Kopya sütunlar (kod, ad, kategori, birim) bu göçte kalır; malzemeler hizmet türünü ekledikten sonra ayrı göçle en son düşer.
-- Karta bağlanamayan kalem sessizce silinmez: göç sayar, sayıyı ve kalemleri yazıp durur, hiçbir şey değişmez.

LOCK TABLE satin_alma_katalog IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  sayi bigint;
  ornek text;
BEGIN
  SELECT count(*), string_agg(k.kod || ' ' || k.ad, ', ' ORDER BY k.kod)
    INTO sayi, ornek
    FROM satin_alma_katalog k
    WHERE k.malzeme_no IS NULL OR NOT EXISTS (SELECT 1 FROM malzeme_katalog_karti m WHERE m.no = k.malzeme_no);
  IF sayi > 0 THEN
    RAISE EXCEPTION 'satin_alma_katalog: % kalem bir malzeme kartına bağlı değil (%). Hiçbir şey değişmedi; kalemlerin kartını "Malzemeler ve Hizmetler"de açıp bağlayın, sonra göçü yeniden çalıştırın.', sayi, ornek;
  END IF;
END $$;

ALTER TABLE satin_alma_katalog ALTER COLUMN malzeme_no SET NOT NULL;
ALTER TABLE satin_alma_katalog
  ADD CONSTRAINT satin_alma_katalog_malzeme FOREIGN KEY (malzeme_no) REFERENCES malzeme_katalog_karti (no);
