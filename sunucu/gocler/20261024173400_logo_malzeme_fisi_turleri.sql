-- Malzeme fişinin sahibi stoktur (293 a, 294 c, 298 a; kart #493). Logo giden kutusu stoğun fişini izler: numarası stok fiş kimliğidir
-- (önce emir kimliğiydi), dört yeni tür girer (fire, sayım fazlası, sayım eksiği, ambar transferi).
-- kaynak_degisiklik: stok fişinin son görülen değişiklik sayacı; artış bekleyen_degisiklik'e eklenir.
-- son_istek, istek_bekliyor: stoktaki elle gönderim isteği ("Gönder", "Yeniden gönder"); elle türde fiş yalnız istekle gider.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM logo_malzeme_fisi_giden;
  RAISE NOTICE 'logo_malzeme_fisi_giden: % satirin numarasi stok fis kimligine cevrilir.', n;
END $$;

ALTER TABLE logo_malzeme_fisi_giden
  DROP CONSTRAINT logo_malzeme_fisi_giden_belge_turu,
  ADD CONSTRAINT logo_malzeme_fisi_giden_belge_turu
    CHECK (belge_turu IN ('sarf-fisi', 'uretim-girisi', 'fire-fisi', 'sayim-fazlasi', 'sayim-eksigi', 'ambar-fisi')),
  ADD COLUMN kaynak_degisiklik int NOT NULL DEFAULT 0 CONSTRAINT logo_malzeme_fisi_giden_kaynak_degisiklik CHECK (kaynak_degisiklik >= 0),
  ADD COLUMN son_istek timestamptz,
  ADD COLUMN istek_bekliyor boolean NOT NULL DEFAULT false;

-- Stok göçü (20261024173200) giden kutusundaki her emir fişine bir stok fişi açtı. İki göç arasında yalnız eski kodun açtığı, hiç hareketi
-- olmayan boş fiş eşsiz kalabilir: Logo'ya gitmemiş ve niyeti yoksa silinir; Logo'da kaydı ya da niyeti olan eşsiz satır göçü durdurur
-- (Logo'daki fiş kaybolmasın).
DELETE FROM logo_malzeme_fisi_giden g
 WHERE g.logo_kayit_no IS NULL AND g.niyet_zamani IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM stok_malzeme_fisi f
      WHERE f.uretim_emri_id = g.belge_no AND f.tur = CASE g.belge_turu WHEN 'sarf-fisi' THEN 'sarf' ELSE 'uretim_girisi' END);
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM logo_malzeme_fisi_giden g
   WHERE NOT EXISTS (
     SELECT 1 FROM stok_malzeme_fisi f
      WHERE f.uretim_emri_id = g.belge_no AND f.tur = CASE g.belge_turu WHEN 'sarf-fisi' THEN 'sarf' ELSE 'uretim_girisi' END);
  IF n > 0 THEN
    RAISE EXCEPTION 'logo_malzeme_fisi_giden: % satirin stok fisi yok ve Logo kaydi ya da niyeti var; once stok fisi acilmali.', n;
  END IF;
END $$;

-- Eski ve yeni numaralar aynı türde çakışabilir: anahtar çevirme süresince kalkar.
ALTER TABLE logo_malzeme_fisi_giden DROP CONSTRAINT logo_malzeme_fisi_giden_pkey;
UPDATE logo_malzeme_fisi_giden g
   SET belge_no = f.id, kaynak_degisiklik = f.degisiklik
  FROM stok_malzeme_fisi f
 WHERE f.uretim_emri_id = g.belge_no AND f.tur = CASE g.belge_turu WHEN 'sarf-fisi' THEN 'sarf' ELSE 'uretim_girisi' END;
ALTER TABLE logo_malzeme_fisi_giden ADD PRIMARY KEY (belge_turu, belge_no);

-- Stoğun değişiklik akışında Logo'nun kaldığı yer (tek satır). Geçmiş alınmaz: imleç göç anındadır, eski fişler yalnız değişince girer.
-- en_buyuk_fis_id: görülmüş en büyük fiş kimliği; daha büyük kimlikli fiş henüz sıraya alınmamış sayılır.
CREATE TABLE logo_malzeme_fisi_imleci (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT logo_malzeme_fisi_imleci_tek CHECK (tek),
  zaman timestamptz NOT NULL,
  fis_id int NOT NULL,
  en_buyuk_fis_id int NOT NULL
);
INSERT INTO logo_malzeme_fisi_imleci (zaman, fis_id, en_buyuk_fis_id)
SELECT now(), COALESCE(max(id), 0), COALESCE(max(id), 0) FROM stok_malzeme_fisi;
