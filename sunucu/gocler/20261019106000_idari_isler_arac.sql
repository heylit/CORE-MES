-- İdari İşler 4: filo araç kartı (172 a). Yeni, boş tablo. Sevkiyat'ın planlama alanları (kapasite, müsaitlik, maliyet) kendi
-- tablosunda kalır; bağ bağlamada plaka ile kurulur.

CREATE TABLE idari_isler_arac (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT idari_isler_arac_pk PRIMARY KEY,
  -- Biçimlenmiş plaka ("34 ABC 123"); sunucu büyük harfe ve tek boşluğa çevirir.
  plaka text NOT NULL CONSTRAINT idari_isler_arac_plaka CHECK (plaka ~ '^[0-9]{2} [A-Z]{1,3} [0-9]{2,5}$'),
  tur text NOT NULL CONSTRAINT idari_isler_arac_tur CHECK (tur IN ('binek', 'kamyonet', 'kamyon', 'minibus', 'diger')),
  marka_model text CONSTRAINT idari_isler_arac_marka_model CHECK (marka_model IS NULL OR (btrim(marka_model) <> '' AND length(marka_model) <= 80)),
  sahiplik text NOT NULL CONSTRAINT idari_isler_arac_sahiplik CHECK (sahiplik IN ('sirket', 'kiralik')),
  durum text NOT NULL DEFAULT 'musait' CONSTRAINT idari_isler_arac_durum CHECK (durum IN ('musait', 'gorevde', 'serviste', 'pasif')),
  km int CONSTRAINT idari_isler_arac_km CHECK (km BETWEEN 0 AND 9999999),
  sonraki_bakim_km int CONSTRAINT idari_isler_arac_bakim_km CHECK (sonraki_bakim_km BETWEEN 0 AND 9999999),
  muayene_tarihi date,
  sigorta_tarihi date,
  sevkiyatta boolean NOT NULL DEFAULT false,
  aciklama text CONSTRAINT idari_isler_arac_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 500)),
  olusturan_kisi_id int NOT NULL CONSTRAINT idari_isler_arac_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CONSTRAINT idari_isler_arac_surum CHECK (surum > 0)
);
-- Plaka tekildir; pasif araç da plakasını tutar.
CREATE UNIQUE INDEX idari_isler_arac_plaka_tek ON idari_isler_arac (plaka);
