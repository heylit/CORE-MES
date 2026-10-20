-- İdari İşler 6: araç masraf kaydı (172 a, 3. dilim). Yeni, boş tablo. Kayıt değişmez; yanlış kayıt gerekçeyle iptal edilir, silinmez.
-- Tutar TL'dir; proje ve finans bağı bağlamada (Aşama 2).

CREATE TABLE idari_isler_arac_masrafi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT idari_isler_arac_masrafi_pk PRIMARY KEY,
  arac_id int NOT NULL CONSTRAINT idari_isler_arac_masrafi_arac REFERENCES idari_isler_arac (id),
  tarih date NOT NULL,
  tur text NOT NULL CONSTRAINT idari_isler_arac_masrafi_tur
    CHECK (tur IN ('yakit', 'bakim', 'onarim', 'lastik', 'muayene', 'sigorta', 'ceza', 'otoyol', 'kira', 'diger')),
  tutar numeric(12, 2) NOT NULL CONSTRAINT idari_isler_arac_masrafi_tutar CHECK (tutar > 0),
  km int CONSTRAINT idari_isler_arac_masrafi_km CHECK (km BETWEEN 0 AND 9999999),
  belge_no text CONSTRAINT idari_isler_arac_masrafi_belge_no CHECK (belge_no IS NULL OR (btrim(belge_no) <> '' AND length(belge_no) <= 60)),
  aciklama text CONSTRAINT idari_isler_arac_masrafi_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 500)),
  kaydeden_kisi_id int NOT NULL CONSTRAINT idari_isler_arac_masrafi_kaydeden REFERENCES kisi (id),
  kayit timestamptz NOT NULL DEFAULT now(),
  iptal_eden_kisi_id int CONSTRAINT idari_isler_arac_masrafi_iptal_eden REFERENCES kisi (id),
  iptal timestamptz,
  iptal_nedeni text CONSTRAINT idari_isler_arac_masrafi_iptal_nedeni CHECK (iptal_nedeni IS NULL OR (btrim(iptal_nedeni) <> '' AND length(iptal_nedeni) <= 500)),
  surum int NOT NULL DEFAULT 1 CONSTRAINT idari_isler_arac_masrafi_surum CHECK (surum > 0),
  -- IDR-28: iptal kimle, ne zaman ve neden birlikte yazılır.
  CONSTRAINT idari_isler_arac_masrafi_iptal_butun CHECK (
    (iptal_eden_kisi_id IS NULL) = (iptal IS NULL) AND (iptal IS NULL) = (iptal_nedeni IS NULL)
  )
);
-- Aracın masrafları en yeniden.
CREATE INDEX idari_isler_arac_masrafi_arac ON idari_isler_arac_masrafi (arac_id, tarih DESC, id DESC);
