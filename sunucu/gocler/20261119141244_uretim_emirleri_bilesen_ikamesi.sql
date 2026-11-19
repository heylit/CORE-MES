-- 3437-3b-3b: satın almanın alternatifle verdiği sipariş emrin bileşenini alternatif karta geçirir (ikame). Kayıt ikamenin kaynağıdır:
-- bileşenler yeniden yazılırken ana kart bu kayıtla alternatife çevrilir (ikame sessizce kaybolmaz). Var olan satır değişmez, yalnız tablo eklenir.
CREATE TABLE uretim_emirleri_bilesen_ikamesi (
  uretim_emri_id int NOT NULL REFERENCES uretim_emri ON DELETE CASCADE,
  ana_malzeme_no int NOT NULL REFERENCES malzeme_katalog_karti (no),
  alternatif_malzeme_no int NOT NULL REFERENCES malzeme_katalog_karti (no),
  kaynak text NOT NULL CONSTRAINT uretim_emirleri_bilesen_ikamesi_kaynak CHECK (length(kaynak) BETWEEN 1 AND 200),
  kisi_id int NOT NULL REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (uretim_emri_id, ana_malzeme_no),
  CONSTRAINT uretim_emirleri_bilesen_ikamesi_farkli CHECK (ana_malzeme_no <> alternatif_malzeme_no)
);
