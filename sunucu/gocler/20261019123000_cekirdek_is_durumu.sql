-- Zamanlanmış işin son turu sunucu yeniden açılınca kaybolmasın: sağlık uyarısı "iş asıldı"yı açılıştan önceki turla da görür.
CREATE TABLE zamanlanmis_is_durumu (
  ad text PRIMARY KEY CHECK (ad ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  son_baslama timestamptz NOT NULL,
  son_bitis timestamptz NOT NULL,
  son_sonuc text NOT NULL CHECK (son_sonuc IN ('tamam', 'hata', 'bekliyor')),
  son_hata text,
  son_neden text,
  -- Hata vermeden biten son tur (tamam ya da bekliyor); hiç olmadıysa NULL.
  son_saglikli_bitis timestamptz,
  CONSTRAINT zamanlanmis_is_durumu_hata CHECK ((son_sonuc = 'hata') = (son_hata IS NOT NULL)),
  CONSTRAINT zamanlanmis_is_durumu_neden CHECK ((son_sonuc = 'bekliyor') = (son_neden IS NOT NULL)),
  CONSTRAINT zamanlanmis_is_durumu_sira CHECK (son_bitis >= son_baslama)
);
