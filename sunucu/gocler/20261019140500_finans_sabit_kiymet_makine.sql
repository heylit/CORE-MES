-- Sabit kıymet istasyonlardaki makineye yabancı anahtarla bağlanır (kullanıcı kararı 312 b, 20.10.2026; dolu tablo göçü onaylı).
-- Sütun boş olabilir; eski satırlar doldurulmaz (314: prototip verisi aktarılmaz). makine_kodu şimdilik kalır, makine kodu değişebilir.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM finans_sabit_kiymet;
  RAISE NOTICE 'finans_sabit_kiymet: % satır; göç boş olabilen makine_id sütunu ekler', satir;
END $$;

ALTER TABLE finans_sabit_kiymet ADD COLUMN makine_id int CONSTRAINT finans_sabit_kiymet_makine REFERENCES makine (id);
CREATE INDEX finans_sabit_kiymet_makine_idx ON finans_sabit_kiymet (makine_id);
