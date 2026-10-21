-- 323 b: Satın alma siparişi tedarikçinin biriminde girer, stoka kartın biriminde düşer; kart tek alış birimi ve katsayısını tutar
-- (1 alış birimi = alis_katsayisi kadar stok birimi). Değerler kartın kaydından yazılır; eski satırlar boş kalır (314: veri aktarılmaz).
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN alis_birimi text CONSTRAINT malzeme_katalog_karti_alis_birimi_dolu CHECK (alis_birimi IS NULL OR btrim(alis_birimi) <> ''),
  ADD COLUMN alis_katsayisi numeric(18, 6) CONSTRAINT malzeme_katalog_karti_alis_katsayisi_pozitif CHECK (alis_katsayisi > 0),
  ADD CONSTRAINT malzeme_katalog_karti_alis_birlikte CHECK ((alis_birimi IS NULL) = (alis_katsayisi IS NULL));
