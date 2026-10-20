-- Personel kaydına isteğe bağlı sicil no (benzersiz) ve görev (serbest metin) eklenir; boş metin yerine NULL tutulur.
ALTER TABLE kisi
  ADD COLUMN sicil_no text,
  ADD COLUMN gorev text,
  ADD CONSTRAINT kisi_sicil_no_gecerli CHECK (sicil_no IS NULL OR (sicil_no = btrim(sicil_no) AND sicil_no <> '' AND char_length(sicil_no) <= 30)),
  ADD CONSTRAINT kisi_gorev_gecerli CHECK (gorev IS NULL OR (gorev = btrim(gorev) AND gorev <> '' AND char_length(gorev) <= 80));

CREATE UNIQUE INDEX kisi_sicil_no_tek ON kisi (sicil_no) WHERE sicil_no IS NOT NULL;

-- Bu andan önce açılmış oturumlar geçersizdir (NULL: kısıt yok). Başkası parolayı değiştirince ya da kişi pasife alınınca
-- yazılır; yeniden aktif yapılınca eski çerez geri çalışmaz. Karşılaştırma veritabanı saatleriyle yapılır.
ALTER TABLE kisi ADD COLUMN oturumlar_gecersiz_once timestamptz;
