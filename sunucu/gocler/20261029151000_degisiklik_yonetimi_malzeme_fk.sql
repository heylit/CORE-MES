-- Değişiklik yönetimindeki parça kimlikleri malzeme kartına yabancı anahtarla bağlanır (1305 a; UYUM-BORCU 10): talep kalemi,
-- emir kalemi ve seri geçerliliğinin son ürünü. Karta bağlanamayan satır sessizce silinmez ve değiştirilmez: göç sayar, sayıyı ve
-- satırları yazıp durur; hiçbir şey değişmez. Satırlar gözden geçirilip kartlar açılınca göç yeniden çalıştırılır.

LOCK TABLE degisiklik_yonetimi_talep_kalemi, degisiklik_yonetimi_emir_kalemi, degisiklik_yonetimi_emir IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  sayi bigint;
  ornek text;
BEGIN
  SELECT count(*), string_agg(b.yer || ' ' || b.kayit || ' → malzeme ' || b.malzeme_id, ', ' ORDER BY b.yer, b.kayit)
    INTO sayi, ornek
    FROM (
      SELECT 'talep kalemi' AS yer, k.id AS kayit, k.malzeme_id
        FROM degisiklik_yonetimi_talep_kalemi k
        WHERE NOT EXISTS (SELECT 1 FROM malzeme_katalog_karti m WHERE m.no = k.malzeme_id)
      UNION ALL
      SELECT 'emir kalemi', k.id, k.malzeme_id
        FROM degisiklik_yonetimi_emir_kalemi k
        WHERE NOT EXISTS (SELECT 1 FROM malzeme_katalog_karti m WHERE m.no = k.malzeme_id)
      UNION ALL
      SELECT 'emir son ürünü', e.id, e.gecerlilik_son_urun_id
        FROM degisiklik_yonetimi_emir e
        WHERE e.gecerlilik_son_urun_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM malzeme_katalog_karti m WHERE m.no = e.gecerlilik_son_urun_id)
    ) b;
  IF sayi > 0 THEN
    RAISE EXCEPTION 'degisiklik_yonetimi: % satır bir malzeme kartına bağlı değil (%). Hiçbir şey değişmedi; satırları gözden geçirin, sonra göçü yeniden çalıştırın.', sayi, ornek;
  END IF;
END $$;

ALTER TABLE degisiklik_yonetimi_talep_kalemi
  ADD CONSTRAINT degisiklik_yonetimi_talep_kalemi_malzeme FOREIGN KEY (malzeme_id) REFERENCES malzeme_katalog_karti (no);
ALTER TABLE degisiklik_yonetimi_emir_kalemi
  ADD CONSTRAINT degisiklik_yonetimi_emir_kalemi_malzeme FOREIGN KEY (malzeme_id) REFERENCES malzeme_katalog_karti (no);
ALTER TABLE degisiklik_yonetimi_emir
  ADD CONSTRAINT degisiklik_yonetimi_emir_son_urun FOREIGN KEY (gecerlilik_son_urun_id) REFERENCES malzeme_katalog_karti (no);
