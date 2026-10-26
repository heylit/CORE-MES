-- Malzeme küçük resmi (kart #688): belgeye teknik resim numarası, revizyona antetteki revizyon, kayda bağa kapak işareti ve
-- "fotograf" belge türü. Sütunlar boş ya da false başlar; var olan satırın anlamı değişmez, veri silinmez.
ALTER TABLE cizimler_belge ADD COLUMN resim_no text
  CONSTRAINT cizimler_belge_resim_no_boyu CHECK (resim_no IS NULL OR (btrim(resim_no) <> '' AND length(resim_no) <= 60));
CREATE INDEX cizimler_belge_resim_no_idx ON cizimler_belge (upper(resim_no)) WHERE resim_no IS NOT NULL;

ALTER TABLE cizimler_belge DROP CONSTRAINT cizimler_belge_tur_degeri;
ALTER TABLE cizimler_belge ADD CONSTRAINT cizimler_belge_tur_degeri
  CHECK (tur IN ('teknik-resim', '3b-model', 'fotograf', 'makine', 'sertifika', 'rapor', 'kroki', 'diger'));

-- Merkezin harfi sıradan türer (A, B, C); antetteki revizyon `00`, `01` olabilir. Boşsa eşleşmede harf kullanılır.
ALTER TABLE cizimler_revizyon ADD COLUMN antet_rev text
  CONSTRAINT cizimler_revizyon_antet_rev_boyu CHECK (antet_rev IS NULL OR (btrim(antet_rev) <> '' AND length(antet_rev) <= 20));

-- Kayıt başına en çok bir kapak; kapak yoksa küçük resim kuralla seçilir.
ALTER TABLE cizimler_bag ADD COLUMN kapak boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX cizimler_bag_tek_kapak ON cizimler_bag (hedef_modul, hedef_id) WHERE kapak;
