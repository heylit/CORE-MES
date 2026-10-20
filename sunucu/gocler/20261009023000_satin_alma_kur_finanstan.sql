-- Güncel kur finanstan okunur (kullanıcı kararı SA3 a, kart #162): satin_alma_kur yalnız para birimi listesi ve aylık faizi tutar.
-- Döviz teklifi kendi gününün kurunu saklar; geçmiş teklifin kuru sonradan değişmez. Kursuz döviz teklifi güncel kura bağlıydı:
-- göç onları sayar, sayıyı ve teklifleri yazıp durur, hiçbir şey değişmez.

LOCK TABLE satin_alma_teklif, satin_alma_kur IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  sayi bigint;
  ornek text;
BEGIN
  SELECT count(*), string_agg(t.no || ' ' || q.para_birimi || ' teklifi ' || q.id::text, ', ' ORDER BY t.no, q.sira)
    INTO sayi, ornek
    FROM satin_alma_teklif q JOIN satin_alma_talep t ON t.id = q.talep_id
    WHERE q.para_birimi <> 'TRY' AND q.kur IS NULL;
  IF sayi > 0 THEN
    RAISE EXCEPTION 'satin_alma_teklif: % döviz teklifinin kuru yok (%). Hiçbir şey değişmedi; bu tekliflere teklif günündeki kuru girin, sonra göçü yeniden çalıştırın.', sayi, ornek;
  END IF;
END $$;

ALTER TABLE satin_alma_kur DROP COLUMN kur;
ALTER TABLE satin_alma_teklif
  ADD CONSTRAINT satin_alma_teklif_doviz_kuru CHECK (para_birimi = 'TRY' OR kur IS NOT NULL);
