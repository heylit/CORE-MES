-- Tedarikçi, finansın firma kartıdır (kullanıcı kararı SA1, kart #162): firma_id finans_firma'ya yabancı anahtarla bağlanır.
-- Finansta karşılığı olmayan tedarikçi sessizce silinmez: göç sayar, sayıyı ve kimlikleri yazıp durur, hiçbir şey değişmez.

LOCK TABLE satin_alma_tedarikci IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  sayi bigint;
  ornek text;
BEGIN
  SELECT count(*), string_agg(t.firma_id::text, ', ' ORDER BY t.firma_id)
    INTO sayi, ornek
    FROM satin_alma_tedarikci t
    WHERE NOT EXISTS (SELECT 1 FROM finans_firma f WHERE f.id = t.firma_id);
  IF sayi > 0 THEN
    RAISE EXCEPTION 'satin_alma_tedarikci: % tedarikçinin finansta firması yok (firma_id: %). Hiçbir şey değişmedi; firmaları finansta açın ya da tedarikçileri gözden geçirin, sonra göçü yeniden çalıştırın.', sayi, ornek;
  END IF;
END $$;

ALTER TABLE satin_alma_tedarikci
  ADD CONSTRAINT satin_alma_tedarikci_firma FOREIGN KEY (firma_id) REFERENCES finans_firma (id);
