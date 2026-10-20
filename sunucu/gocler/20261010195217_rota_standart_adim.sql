-- Standart rota operasyon tipini kimlikle tutar: kod düzenlenebilir (#460), kodla arama kod değişince kırılırdı (kullanıcı kararı, kart #464).
CREATE TABLE rota_standart_adim (
  sira int PRIMARY KEY CONSTRAINT rota_standart_adim_sira_pozitif CHECK (sira > 0),
  operasyon_tipi_id int NOT NULL CONSTRAINT rota_standart_adim_operasyon_tipi_bagi REFERENCES istasyonlar_operasyon_tipi (id),
  ad text NOT NULL CONSTRAINT rota_standart_adim_ad_dolu CHECK (btrim(ad) <> '')
);

-- Bir kez, bugünkü katalog kodlarından dolar (karar RT2 a: katalog esas; teslimdeki kodlarla eşleme UYUM-BORCU B1).
-- Katalogda bulunmayan kod atlanır ve bildirilir; göç durmaz.
DO $$
DECLARE
  eksik text;
BEGIN
  WITH liste (sira, kod, ad) AS (VALUES
    (1, 'GKK', 'Depo girişi'), (2, 'TRN', 'Tornalama'), (3, 'BM', 'Muayene'), (4, 'FRZ', 'Frezeleme'), (5, 'BM', 'Muayene'),
    (6, 'CPK', 'Tesviye'), (7, 'BM', 'Muayene'), (8, 'LMK', 'Markalama'), (9, 'FSN', 'Özel proses'), (10, 'SKK', 'Son muayene'),
    (11, 'PKT', 'Sevk')
  ), eklenen AS (
    INSERT INTO rota_standart_adim (sira, operasyon_tipi_id, ad)
    SELECT l.sira, t.id, l.ad FROM liste l JOIN istasyonlar_operasyon_tipi t ON t.kod = l.kod
    RETURNING sira
  )
  SELECT string_agg(l.kod, ', ' ORDER BY l.sira) INTO eksik FROM liste l WHERE l.sira NOT IN (SELECT sira FROM eklenen);
  IF eksik IS NOT NULL THEN
    RAISE NOTICE 'Standart rotada katalogda bulunmayan operasyon kodları atlandı: %', eksik;
  END IF;
END $$;
