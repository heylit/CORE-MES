-- Kişiye teslim (299 b): teslim, alacak kişinin gösterdiği kısa süreli kodla o kişiye yazılır; yalnız o kişi alır ya da reddeder.
-- Var olan satırlar değişmez, silinmez: alıcısı boş teslimi eskisi gibi istasyonun ya da deponun yetkilisi alır.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM stok_teslim;
  RAISE NOTICE 'stok_teslim_alici_kisi: % teslim satiri degismez.', n;
END $$;

ALTER TABLE stok_teslim ADD COLUMN alici_kisi_id int CONSTRAINT stok_teslim_alici_var REFERENCES kisi;
CREATE INDEX stok_teslim_yolda_alici_idx ON stok_teslim (alici_kisi_id) WHERE durum = 'yolda' AND alici_kisi_id IS NOT NULL;
